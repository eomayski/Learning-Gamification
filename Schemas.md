## Приложение: примерна схема на новите колекции

Примерни Mongoose схеми за геймификационния слой, описан в `Requirements.md`. Кодът е **илюстративен** - показва структурата, връзките и индексите, не е готов за продукция (липсват валидации, hooks, миграции).

### Водещи решения в моделирането

1. **Съществуващите схеми не се пипат.** Всяка референция към учебния домейн е `ObjectId` с `ref` - `User`, `Course`, `CourseInstance`, `Assessment`, `Survey`, `Program`.
2. **Журналът е истината, балансът е кеш.** `UserGamificationProfile.credits` е денормализиран сбор от `CreditTransaction`. При съмнение балансът се преизчислява от журнала, не обратното.
3. **Идемпотентност.** Всяка транзакция има `idempotencyKey`, съставен от източника (напр. `mission-complete:<missionId>:<userId>`). Уникален индекс - повторно събитие не начислява втори път. Това е най-честият източник на счупена икономика.
4. **Един каталог за предметите.** `ItemDefinition` описва всичко (скин, чертеж, материал, кутия, консуматив, ефект, utility) чрез общи полета + `payload` за специфичното. Алтернативата - отделна колекция за всеки тип - прави инвентара, маркета и лабораторията невъзможни за писане общо.
5. **Многокомпонентните операции са атомарни.** Крафт, покупка и сделка в маркета пипат няколко документа - изискват MongoDB transactions (replica set) или compensating logic. Отбелязано е на съответните места.

---

## 1. Общи константи

```js
// constants/gamification.js

const RARITY = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
};

const ITEM_TYPE = {
  SKIN: 'skin',
  BLUEPRINT: 'blueprint',
  MATERIAL: 'material',
  CASE: 'case',
  CONSUMABLE: 'consumable',
  EFFECT: 'effect',
  UTILITY: 'utility',
  TITLE: 'title',
};

const MATERIAL_KIND = {
  CORE: 'core',
  FRAGMENT: 'fragment',
  PIGMENT: 'pigment',
  SCHEMATIC: 'schematic',
};

const ACQUIRED_VIA = {
  DROP: 'drop',
  CRAFT: 'craft',
  SHOP: 'shop',
  CASE: 'case',
  MARKET: 'market',
  REWARD: 'reward',
  SYSTEM: 'system',
};

module.exports = { RARITY, ITEM_TYPE, MATERIAL_KIND, ACQUIRED_VIA };
```

---

## 2. Ядро

### 2.1 UserGamificationProfile

```js
const userGamificationProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  xp:    { type: Number, default: 0, min: 0 },
  level: { type: Number, default: 1, min: 1 },

  // Сезонни точки. Историята на минали сезони е в SeasonStanding.
  seasonPoints: { type: Number, default: 0, min: 0 },
  currentSeason: { type: Schema.Types.ObjectId, ref: 'Season' },

  // Кеш на баланса. Източник на истина: CreditTransaction.
  credits: { type: Number, default: 0, min: 0 },
  creditsBalanceVersion: { type: Number, default: 0 }, // за optimistic locking

  // Екипирана козметика - референции към ItemDefinition
  equipped: {
    skin:         { type: Schema.Types.ObjectId, ref: 'ItemDefinition', default: null },
    title:        { type: Schema.Types.ObjectId, ref: 'ItemDefinition', default: null },
    avatarFrame:  { type: Schema.Types.ObjectId, ref: 'ItemDefinition', default: null },
    nameEffect:   { type: Schema.Types.ObjectId, ref: 'ItemDefinition', default: null },
    profileBg:    { type: Schema.Types.ObjectId, ref: 'ItemDefinition', default: null },
  },

  // Дневни/седмични тавани и намаляваща възвръщаемост (т. 3.3 и 3.6)
  dailyCounters: {
    date: { type: Date },
    activityCounts: { type: Map, of: Number, default: {} }, // 'video' -> 3
    creditsEarned: { type: Number, default: 0 },
  },
  weeklyCreditsEarned: { type: Number, default: 0 },

  // Потребителски предпочитания за ефекти (accessibility, т. 11.2)
  preferences: {
    reduceMotion:      { type: Boolean, default: false },
    hideOthersEffects: { type: Boolean, default: false },
  },

  unlockedFeatures: [{ type: String }], // 'lab', 'market', 'guild_create'

  stats: {
    missionsCompleted:  { type: Number, default: 0 },
    missionsPerfect:    { type: Number, default: 0 },
    itemsCrafted:       { type: Number, default: 0 },
    itemsDismantled:    { type: Number, default: 0 },
    casesOpened:        { type: Number, default: 0 },
    marketSales:        { type: Number, default: 0 },
  },
}, { timestamps: true });

userGamificationProfileSchema.index({ seasonPoints: -1 });
userGamificationProfileSchema.index({ xp: -1 });
```

> **Защо `equipped` е плосък обект, а не масив:** слотовете са фиксирани и различни по семантика. Масив би позволил два екипирани скина едновременно - грешка, която се хваща трудно.

### 2.2 Транзакционни журнали

```js
const xpTransactionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  xpAmount:     { type: Number, required: true },
  pointsAmount: { type: Number, default: 0 },

  baseXp:     { type: Number, required: true },
  multiplier: { type: Number, default: 1 },   // 2.0 / 1.0 / 0.7 / 0.5 / 0.3 / 0.2
  multiplierReason: { type: String },          // 'first_of_day', 'diminishing_3'

  source: {
    type: String,
    required: true,
    enum: ['video', 'lesson', 'assessment', 'course', 'live_attendance',
           'survey', 'program', 'quest', 'mission_perfect', 'guild_quest', 'admin'],
  },
  // Полиморфна референция към събитието
  sourceRef:   { type: Schema.Types.ObjectId },
  sourceModel: { type: String, enum: ['CourseInstance', 'Assessment', 'Survey',
                                      'Course', 'Program', 'Mission', 'Quest'] },

  season: { type: Schema.Types.ObjectId, ref: 'Season' },
  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

xpTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
xpTransactionSchema.index({ user: 1, createdAt: -1 });
xpTransactionSchema.index({ user: 1, source: 1, createdAt: -1 }); // за дневните тавани
```

```js
const creditTransactionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  amount:        { type: Number, required: true }, // + начисляване, − харчене
  balanceAfter:  { type: Number, required: true }, // за одит и за откриване на разминаване

  direction: { type: String, enum: ['earn', 'spend', 'burn', 'refund'], required: true },

  reason: {
    type: String,
    required: true,
    enum: ['mission_complete', 'mission_perfect', 'lesson_complete', 'course_complete',
           'program_complete', 'streak_week', 'streak_milestone', 'quest', 'guild_quest',
           'leaderboard', 'badge',
           'shop_purchase', 'case_purchase', 'craft_fee', 'dismantle_fee', 'convert_fee',
           'market_purchase', 'market_sale', 'market_commission',
           'admin_grant', 'admin_revoke'],
  },

  relatedItem:    { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },
  relatedListing: { type: Schema.Types.ObjectId, ref: 'MarketListing' },
  counterparty:   { type: Schema.Types.ObjectId, ref: 'User' }, // при P2P сделка

  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

creditTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
creditTransactionSchema.index({ user: 1, createdAt: -1 });
creditTransactionSchema.index({ reason: 1, createdAt: -1 }); // за икономически отчети
creditTransactionSchema.index({ user: 1, counterparty: 1, createdAt: -1 }); // anti-abuse (т. 15.4)
```

> Последният индекс е точно за детекцията на прехвърляне на стойност между два акаунта - без него проверката става full scan.

### 2.3 Streak

```js
const streakSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  currentWeeks: { type: Number, default: 0 },
  longestWeeks: { type: Number, default: 0 },

  currentWeekStart:  { type: Date },
  currentWeekPoints: { type: Number, default: 0 },
  weeklyThreshold:   { type: Number, default: 200 },

  lastCompletedWeek: { type: Date },
  cleanWeeksSinceFreezeUse: { type: Number, default: 0 }, // за безплатното възстановяване

  // Streak Freeze е предмет в инвентара; тук се пази само състоянието му
  freeze: {
    available:      { type: Boolean, default: true }, // стартов предмет при регистрация
    lastUsedAt:     { type: Date, default: null },
    cooldownUntil:  { type: Date, default: null },
    timesUsed:      { type: Number, default: 0 },
  },

  history: [{
    weekStart:   { type: Date },
    points:      { type: Number },
    completed:   { type: Boolean },
    freezeUsed:  { type: Boolean, default: false },
  }],
}, { timestamps: true });
```

> **Дублиране по проект:** `freeze.available` дублира наличието на предмета в `UserInventoryItem`. Прието съзнателно - проверката при затваряне на седмица е гореща и не бива да прави join. Инвентарът остава източник на истина; този флаг се синхронизира при всяка промяна.

### 2.4 Season и Badge

```js
const seasonSchema = new Schema({
  name:      { type: String, required: true },
  startsAt:  { type: Date, required: true },
  endsAt:    { type: Date, required: true },
  isActive:  { type: Boolean, default: false },
  collection_: { type: Schema.Types.ObjectId, ref: 'Collection' }, // сезонна колекция (т. 17.3)
  rewardsDistributedAt: { type: Date },
}, { timestamps: true });

const badgeSchema = new Schema({
  code:        { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  description: { type: String },
  category: {
    type: String,
    enum: ['progress', 'consistency', 'exploration', 'social', 'collector', 'hidden'],
    required: true,
  },
  iconUrl:  { type: String },
  rarity:   { type: Number, min: 1, max: 5, default: 1 },
  rewards: {
    xp:      { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    items:   [{ item: { type: Schema.Types.ObjectId, ref: 'ItemDefinition' }, quantity: Number }],
  },
  criteria: { type: Schema.Types.Mixed }, // декларативно условие, оценявано от rules engine
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const userBadgeSchema = new Schema({
  user:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  badge:     { type: Schema.Types.ObjectId, ref: 'Badge', required: true },
  earnedAt:  { type: Date, default: Date.now },
  progress:  { type: Number, default: 100 }, // за баджове с частичен прогрес
}, { timestamps: true });

userBadgeSchema.index({ user: 1, badge: 1 }, { unique: true });
```

---

## 3. Мисийна рамка

### 3.1 Mission

```js
const missionObjectiveSchema = new Schema({
  code:  { type: String, required: true },  // уникален в рамките на мисията
  title: { type: String, required: true },
  description: { type: String },

  type: {
    type: String,
    enum: ['watch_briefing', 'read_intel', 'assessment', 'survey', 'practical', 'custom'],
    required: true,
  },

  isMandatory: { type: Boolean, default: true }, // основна vs. допълнителна цел
  order:       { type: Number, default: 0 },

  // Референция към реалния учебен обект
  targetRef:   { type: Schema.Types.ObjectId },
  targetModel: { type: String, enum: ['Assessment', 'Survey', 'Resource', 'Lesson'] },

  completionRule: {
    minScore:        { type: Number },  // за тестове
    minWatchPercent: { type: Number },  // за видео
    requiresApproval:{ type: Boolean, default: false },
  },

  rewards: {
    xp:      { type: Number, default: 0 },
    points:  { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
  },
}, { _id: true });

const missionSchema = new Schema({
  // Връзка към съществуващия учебен домейн - схемите му не се променят
  courseInstance: { type: Schema.Types.ObjectId, ref: 'CourseInstance', required: true },
  lessonId:       { type: Schema.Types.ObjectId, required: true }, // subdoc в curriculum.lessons

  code:  { type: String, required: true },  // 'OP-BACKEND-M03'
  title: { type: String, required: true },  // мисийното име на урока
  summary: { type: String },

  briefing: {
    videoRef: { type: Schema.Types.ObjectId },
    durationSeconds: { type: Number },
  },

  intel: [{
    label: { type: String },
    resourceRef: { type: Schema.Types.ObjectId },
    kind: { type: String, enum: ['presentation', 'document', 'link', 'code', 'other'] },
  }],

  objectives: [missionObjectiveSchema],

  debrief: {
    surveyRef: { type: Schema.Types.ObjectId, ref: 'Survey' },
    isRequired: { type: Boolean, default: false },
  },

  // Награда при изпълнение на ВСИЧКИ цели (т. 2.4)
  perfectCompletionRewards: {
    xpBonusPercent: { type: Number, default: 50 },
    points:  { type: Number, default: 0 },
    credits: { type: Number, default: 25 },
    dropTable: { type: Schema.Types.ObjectId, ref: 'DropTable' },
  },

  order:      { type: Number, default: 0 },
  unlockedBy: [{ type: Schema.Types.ObjectId, ref: 'Mission' }], // предходни мисии
  minLevel:   { type: Number, default: 1 },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

missionSchema.index({ courseInstance: 1, lessonId: 1 }, { unique: true });
missionSchema.index({ courseInstance: 1, order: 1 });
```

> **Целите са вложени, не отделна колекция.** Те нямат живот извън мисията и винаги се четат заедно с нея. Прогресът на потребителя е отделен документ, защото се пише често и е per user.

### 3.2 UserMissionProgress и лог

```js
const userMissionProgressSchema = new Schema({
  user:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mission: { type: Schema.Types.ObjectId, ref: 'Mission', required: true },

  status: {
    type: String,
    enum: ['locked', 'available', 'in_progress', 'completed', 'perfect'],
    default: 'locked',
  },

  objectives: [{
    objectiveId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' },
    score:       { type: Number },
    attempts:    { type: Number, default: 0 },
    completedAt: { type: Date },
    rewarded:    { type: Boolean, default: false },
  }],

  briefingProgress: {
    watchedSeconds:   { type: Number, default: 0 },
    checkpointsPassed:[{ type: String }],  // anti-abuse (т. 15.1)
    completed:        { type: Boolean, default: false },
  },

  mandatoryCompleted: { type: Number, default: 0 },
  mandatoryTotal:     { type: Number, default: 0 },
  optionalCompleted:  { type: Number, default: 0 },
  optionalTotal:      { type: Number, default: 0 },

  perfectAwarded: { type: Boolean, default: false },
  startedAt:      { type: Date },
  completedAt:    { type: Date },
}, { timestamps: true });

userMissionProgressSchema.index({ user: 1, mission: 1 }, { unique: true });
userMissionProgressSchema.index({ user: 1, status: 1 });
```

```js
const missionLogEntrySchema = new Schema({
  user:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mission: { type: Schema.Types.ObjectId, ref: 'Mission', required: true },

  event: {
    type: String,
    required: true,
    enum: ['mission_unlocked', 'briefing_started', 'briefing_completed', 'intel_opened',
           'objective_started', 'objective_completed', 'objective_failed',
           'debrief_submitted', 'mission_completed', 'perfect_completion',
           'reward_granted', 'item_dropped'],
  },

  objectiveId: { type: Schema.Types.ObjectId },
  message:     { type: String },     // готов за показване текст на български
  payload:     { type: Schema.Types.Mixed }, // резултат, награда, дроп
  visibleToUser: { type: Boolean, default: true },

  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

missionLogEntrySchema.index({ user: 1, mission: 1, occurredAt: -1 });
missionLogEntrySchema.index({ user: 1, occurredAt: -1 }); // общ feed на активността
```

> Логът расте бързо. Препоръка: TTL или архивиране на записи с `visibleToUser: false` след 90 дни; потребителските остават.

---

## 4. Предмети и каталог

### 4.1 ItemDefinition

```js
const itemDefinitionSchema = new Schema({
  code: { type: String, required: true, unique: true }, // 'skin_neon_terminal_v1'
  name: { type: String, required: true },
  description: { type: String },

  type:   { type: String, enum: Object.values(ITEM_TYPE), required: true },
  rarity: { type: Number, min: 1, max: 5, required: true },

  collectionRef: { type: Schema.Types.ObjectId, ref: 'Collection' },

  baseValue: { type: Number, required: true }, // референтна стойност в кредити
  isTradable: { type: Boolean, default: true },
  isStackable:{ type: Boolean, default: false }, // материали - да; скинове - не
  maxOwned:   { type: Number, default: null },   // Streak Freeze -> 1

  assets: {
    iconUrl:    { type: String },
    previewUrl: { type: String },
  },

  // Специфично за типа
  payload: {
    // type: 'material'
    materialKind: { type: String, enum: Object.values(MATERIAL_KIND) },

    // type: 'blueprint'
    recipe:       { type: Schema.Types.ObjectId, ref: 'Recipe' },

    // type: 'skin'
    functionalBonus: {
      kind: { type: String, enum: ['test_hint', 'mistake_forgiveness', 'credit_bonus', 'drop_bonus'] },
      value: { type: Number },
      // Никога не важи за сертификационни изпити (т. 13)
      allowedContexts: [{ type: String, enum: ['practice_test', 'mission', 'global'] }],
      usesPerPeriod: { type: Number },
      period: { type: String, enum: ['day', 'week', 'month'] },
    },

    // type: 'effect' - предефиниран пресет, НЕ произволен CSS (т. 11.2)
    effect: {
      slot:      { type: String, enum: ['name_color', 'name_glow', 'avatar_frame', 'profile_bg', 'leaderboard'] },
      presetKey: { type: String },  // ключ към CSS клас/дизайн токени
      animated:  { type: Boolean, default: false },
      contrastSafe: { type: Boolean, default: true }, // проверено за четимост
    },

    // type: 'consumable'
    consumable: {
      kind:            { type: String, enum: ['streak_freeze', 'xp_multiplier', 'retry', 'objective_skip'] },
      durationHours:   { type: Number },
      cooldownDays:    { type: Number },
    },

    // type: 'case'
    caseDefinition: { type: Schema.Types.ObjectId, ref: 'CaseDefinition' },

    // type: 'utility'
    utility: {
      kind:       { type: String, enum: ['cv_template', 'icon_pack', 'color_scheme', 'certificate_design', 'public_profile'] },
      templateKey:{ type: String },
      exportFormats: [{ type: String, enum: ['pdf', 'docx', 'png'] }],
    },
  },

  availability: {
    from: { type: Date },
    to:   { type: Date },   // сезонни/ограничени предмети
    source: [{ type: String, enum: ['drop', 'case', 'craft', 'shop', 'reward'] }],
  },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

itemDefinitionSchema.index({ type: 1, rarity: 1 });
itemDefinitionSchema.index({ collectionRef: 1 });
itemDefinitionSchema.index({ isTradable: 1, type: 1 });
```

> `payload` е нормално да изглежда неудобно. Алтернативата е Mongoose **discriminators** - по-чисто типизиране, но с цената на по-сложни заявки през целия каталог. Ако типовете нараснат, си струва да се мине към discriminators върху обща базова схема.

### 4.2 Collection

```js
const collectionSchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },

  season: { type: Schema.Types.ObjectId, ref: 'Season' },
  theme:  { type: String },

  items: [{ type: Schema.Types.ObjectId, ref: 'ItemDefinition' }],

  completionReward: {
    badge:   { type: Schema.Types.ObjectId, ref: 'Badge' },
    title:   { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },
    credits: { type: Number, default: 0 },
    xp:      { type: Number, default: 0 },
  },

  availableFrom: { type: Date },
  availableTo:   { type: Date },  // след това - само през маркета
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });
```

### 4.3 UserInventoryItem

```js
const userInventoryItemSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  item: { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },

  quantity: { type: Number, default: 1, min: 0 },

  acquiredVia: { type: String, enum: Object.values(ACQUIRED_VIA), required: true },
  acquiredAt:  { type: Date, default: Date.now },
  acquiredRef: { type: Schema.Types.ObjectId }, // CaseOpening / MarketTransaction / CraftingTransaction

  tradeLockUntil: { type: Date, default: null }, // т. 12.4
  isListed:  { type: Boolean, default: false },  // публикуван в маркета
  isEquipped:{ type: Boolean, default: false },

  // За консумативи
  consumedAt:   { type: Date },
  usesRemaining:{ type: Number },
}, { timestamps: true });

// Стакващите се предмети - един ред на потребител
userInventoryItemSchema.index(
  { user: 1, item: 1 },
  { unique: true, partialFilterExpression: { quantity: { $gte: 0 }, isListed: false } }
);
userInventoryItemSchema.index({ user: 1, isListed: 1 });
userInventoryItemSchema.index({ tradeLockUntil: 1 });
```

> **Внимание при уникалния индекс.** Стакващите се предмети (материали) искат един ред с `quantity`; нестакващите (скинове, за да имат отделен произход и trade lock) искат по ред на бройка. Двата режима трудно живеят под един уникален индекс - вариантът горе е компромис. По-чисто е разделяне на две колекции или отказ от уникалния индекс с логика в сервиза.

---

## 5. Лаборатория

### 5.1 Recipe

```js
const recipeSchema = new Schema({
  code: { type: String, required: true, unique: true },

  // Какво произвежда
  output: {
    item:     { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },
    quantity: { type: Number, default: 1 },
  },

  kind: {
    type: String,
    enum: ['craft', 'convert_up', 'convert_side', 'dismantle'],
    required: true,
  },

  inputs: [{
    item:     { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },
    // Алтернатива: изискване по категория, а не по конкретен предмет
    materialKind: { type: String, enum: Object.values(MATERIAL_KIND) },
    rarity:   { type: Number, min: 1, max: 5 },
    quantity: { type: Number, required: true },
  }],

  // Чертежът се консумира при крафт
  requiresBlueprint: { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },

  creditFee: { type: Number, default: 0 },
  minLevel:  { type: Number, default: 4 },

  // Само за kind: 'dismantle' - процент възвръщаемост (т. 9.2)
  returnPercent:      { type: Number, min: 0, max: 100, default: 50 },
  guaranteedMinItems: { type: Number, default: 1 },

  dailyLimit: { type: Number, default: null },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

recipeSchema.index({ kind: 1, isActive: 1 });
recipeSchema.index({ 'output.item': 1 });
```

### 5.2 CraftingTransaction

```js
const craftingTransactionSchema = new Schema({
  user:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipe: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true },
  kind:   { type: String, enum: ['craft', 'convert_up', 'convert_side', 'dismantle'], required: true },

  // Снимка на реално консумираното - рецептата може да се промени по-късно
  consumed: [{
    item:     { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },
    quantity: { type: Number },
  }],
  produced: [{
    item:     { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },
    quantity: { type: Number },
  }],

  creditFee: { type: Number, default: 0 },
  creditTransaction: { type: Schema.Types.ObjectId, ref: 'CreditTransaction' },

  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

craftingTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
craftingTransactionSchema.index({ user: 1, createdAt: -1 });
```

> Операцията пипа инвентара (изваждане + добавяне), баланса и този запис. Задължително в MongoDB транзакция - иначе при срив по средата потребителят губи материали без резултат, което е най-скъпият възможен бъг за доверието в системата.

---

## 6. Кутии

### 6.1 CaseDefinition и DropTable

```js
const dropTableSchema = new Schema({
  code:    { type: String, required: true, unique: true },
  version: { type: Number, default: 1 },  // при промяна се вдига - записва се в CaseOpening

  entries: [{
    item:   { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },
    // Алтернатива: случаен предмет от дадена рядкост в дадена колекция
    rarity: { type: Number, min: 1, max: 5 },
    collectionRef: { type: Schema.Types.ObjectId, ref: 'Collection' },
    weight: { type: Number, required: true },  // относителна тежест
    quantity: { type: Number, default: 1 },
  }],
}, { timestamps: true });
```

```js
const caseDefinitionSchema = new Schema({
  code:  { type: String, required: true, unique: true },
  name:  { type: String, required: true },
  level: { type: Number, min: 1, max: 5, required: true },

  collectionRef: { type: Schema.Types.ObjectId, ref: 'Collection' }, // тематична кутия (т. 10.6)

  // Разпределение по нива спрямо нивото на кутията (т. 10.1)
  tierChances: [{
    tierOffset: { type: Number, required: true }, // 0, +1, +2, +3
    chance:     { type: Number, required: true }, // 80, 15, 4, 1
  }],

  dropTable: { type: Schema.Types.ObjectId, ref: 'DropTable', required: true },
  tableVersion: { type: Number, required: true },

  // Защита от лош късмет (т. 10.3)
  pity: {
    enabled:   { type: Boolean, default: true },
    threshold: { type: Number, default: 10 },  // след N отваряния
    guaranteedTierOffset: { type: Number, default: 1 },
  },

  priceCredits: { type: Number, required: true },
  isPurchasable:{ type: Boolean, default: true },
  // Изрично: кутиите НЕ се купуват с реални пари (т. 10.4)

  availableFrom: { type: Date },
  availableTo:   { type: Date },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true });
```

### 6.2 CaseOpening

```js
const caseOpeningSchema = new Schema({
  user:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  caseDefinition: { type: Schema.Types.ObjectId, ref: 'CaseDefinition', required: true },

  // Одитна следа: с коя точно версия на таблицата е изтеглено (т. 15.6)
  dropTable:    { type: Schema.Types.ObjectId, ref: 'DropTable', required: true },
  tableVersion: { type: Number, required: true },

  resultItem:  { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },
  resultTier:  { type: Number, required: true },
  tierOffset:  { type: Number, required: true },

  pityCounterBefore: { type: Number, default: 0 },
  pityCounterAfter:  { type: Number, default: 0 },
  pityTriggered:     { type: Boolean, default: false },

  rollSeed:  { type: String },  // за възпроизводимост при спор
  rollValue: { type: Number },

  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

caseOpeningSchema.index({ idempotencyKey: 1 }, { unique: true });
caseOpeningSchema.index({ user: 1, createdAt: -1 });
caseOpeningSchema.index({ caseDefinition: 1, resultTier: 1 }); // проверка на реалните шансове
```

> Последният индекс позволява да се провери, че емпиричното разпределение съвпада с обявеното. При система с публикувани шансове това не е екстра - това е задължението, което поемаш, когато ги обявиш.

---

## 7. Магазин и P2P маркет

### 7.1 ShopItem

```js
const shopItemSchema = new Schema({
  item: { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },

  priceCredits: { type: Number, required: true },
  discountPercent: { type: Number, default: 0 },

  category: {
    type: String,
    enum: ['consumable', 'case', 'effect', 'utility', 'material', 'skin'],
    required: true,
  },

  stock:          { type: Number, default: null }, // null = неограничено
  perUserLimit:   { type: Number, default: null },
  perUserPeriod:  { type: String, enum: ['day', 'week', 'month', 'ever'], default: 'ever' },

  minLevel:       { type: Number, default: 1 },
  requiresBadge:  { type: Schema.Types.ObjectId, ref: 'Badge' },

  rotationFrom: { type: Date },
  rotationTo:   { type: Date },
  isFeatured:   { type: Boolean, default: false },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

shopItemSchema.index({ category: 1, isActive: 1 });
shopItemSchema.index({ rotationFrom: 1, rotationTo: 1 });
```

### 7.2 MarketListing

```js
const marketListingSchema = new Schema({
  seller:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  item:          { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },
  inventoryItem: { type: Schema.Types.ObjectId, ref: 'UserInventoryItem', required: true },

  quantity: { type: Number, default: 1, min: 1 },
  pricePerUnit: { type: Number, required: true },

  status: {
    type: String,
    enum: ['active', 'sold', 'cancelled', 'expired'],
    default: 'active',
  },

  expiresAt: { type: Date, required: true }, // напр. +7 дни

  // Снимка на ограничителя към момента на публикуване (т. 12.3)
  priceFloor: { type: Number },
  priceCeil:  { type: Number },

  soldAt:     { type: Date },
  buyer:      { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

marketListingSchema.index({ item: 1, status: 1, pricePerUnit: 1 }); // основната заявка на пазара
marketListingSchema.index({ seller: 1, status: 1 });
marketListingSchema.index({ expiresAt: 1, status: 1 });            // за cron-а с изтичането
```

### 7.3 MarketTransaction

```js
const marketTransactionSchema = new Schema({
  listing: { type: Schema.Types.ObjectId, ref: 'MarketListing', required: true },
  item:    { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },

  seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  buyer:  { type: Schema.Types.ObjectId, ref: 'User', required: true },

  quantity:   { type: Number, required: true },
  unitPrice:  { type: Number, required: true },
  totalPrice: { type: Number, required: true },

  commissionPercent: { type: Number, required: true },
  commissionAmount:  { type: Number, required: true }, // изгаря
  sellerReceived:    { type: Number, required: true },

  // Anti-abuse снимка към момента на сделката (т. 15.4)
  flags: {
    priceDeviationPercent: { type: Number }, // отклонение от средната цена
    repeatCounterparty:    { type: Boolean, default: false },
    reviewRequired:        { type: Boolean, default: false },
  },

  idempotencyKey: { type: String, required: true },
}, { timestamps: true });

marketTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
marketTransactionSchema.index({ item: 1, createdAt: -1 });        // история на цените (т. 12.5)
marketTransactionSchema.index({ seller: 1, buyer: 1, createdAt: -1 }); // детекция на дуото
```

### 7.4 ItemPriceHistory (денормализация)

```js
const itemPriceHistorySchema = new Schema({
  item: { type: Schema.Types.ObjectId, ref: 'ItemDefinition', required: true },
  date: { type: Date, required: true },  // ден

  salesCount:  { type: Number, default: 0 },
  volume:      { type: Number, default: 0 },
  avgPrice:    { type: Number },
  medianPrice: { type: Number },
  minPrice:    { type: Number },
  maxPrice:    { type: Number },
}, { timestamps: true });

itemPriceHistorySchema.index({ item: 1, date: -1 }, { unique: true });
```

> Попълва се от нощен job върху `MarketTransaction`. Ползва се и за графиката пред потребителя, и за изчисляване на ценовия ограничител на следващия ден.

---

## 8. Куестове и гилдии (кратко)

```js
const questSchema = new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  scope: { type: String, enum: ['daily', 'weekly', 'seasonal', 'guild'], required: true },

  criteria: { type: Schema.Types.Mixed },  // декларативно условие
  targetValue: { type: Number, default: 1 },

  rewards: {
    xp: Number, points: Number, credits: Number,
    items: [{ item: { type: Schema.Types.ObjectId, ref: 'ItemDefinition' }, quantity: Number }],
  },

  minLevel: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const userQuestProgressSchema = new Schema({
  user:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  quest: { type: Schema.Types.ObjectId, ref: 'Quest', required: true },
  periodKey: { type: String, required: true }, // '2026-W31' / '2026-07-28'

  currentValue: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed', 'claimed', 'expired'], default: 'active' },
  claimedAt: { type: Date },
}, { timestamps: true });

userQuestProgressSchema.index({ user: 1, quest: 1, periodKey: 1 }, { unique: true });
```

```js
const guildSchema = new Schema({
  name: { type: String, required: true, unique: true },
  tag:  { type: String, maxlength: 5 },
  description: { type: String },

  master:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  level:   { type: Number, default: 1 },
  memberCap: { type: Number, default: 10 },  // расте до 30 с нивото

  seasonPoints: { type: Number, default: 0 },
  totalPoints:  { type: Number, default: 0 },

  treasuryCredits: { type: Number, default: 0 },  // т. 14.5
  emblem: { type: Schema.Types.ObjectId, ref: 'ItemDefinition' },

  isRecruiting: { type: Boolean, default: true },
}, { timestamps: true });

const guildMembershipSchema = new Schema({
  guild:  { type: Schema.Types.ObjectId, ref: 'Guild', required: true },
  user:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role:   { type: String, enum: ['master', 'officer', 'member'], default: 'member' },
  contributedPoints: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

guildMembershipSchema.index({ guild: 1, user: 1 }, { unique: true });
guildMembershipSchema.index({ user: 1 }, { unique: true }); // една гилдия наведнъж
```

---

## 9. Отворени въпроси по моделирането

1. **Стакващи vs. нестакващи предмети** - изисква решение преди имплементация (виж бележката към `UserInventoryItem`). Най-чисто: `UserMaterialStack` за стакващите и `UserInventoryItem` за уникалните.
2. **Rules engine за критерии** - `criteria: Mixed` е удобно за старт, но след 20-30 бадж/куест дефиниции става неподдържаемо. Заслужава си малък DSL с валидация по схема.
3. **Транзакционност** - крафт, покупка и P2P сделка изискват MongoDB replica set. Ако средата е standalone, трябва compensating logic с outbox.
4. **Преизчисляване на баланса** - нужен е периодичен job, който сверява `UserGamificationProfile.credits` със сбора от `CreditTransaction` и алармира при разминаване.
5. **Обем на `MissionLogEntry`** - при 1000 активни потребители × 10 събития/мисия расте бързо. Нужна е стратегия за архивиране от ден едно.
