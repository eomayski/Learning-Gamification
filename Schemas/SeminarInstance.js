import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

import { CONTENT_TYPES } from '../constants';

const seminarInstanceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    // Optional Bulgarian display name. Mirrors descriptionBg pattern.
    // When empty, FE falls back to `name`. See utils/helpers.js pickInstanceName.
    nameBg: {
        type: String,
        default: '',
    },
    cid: {
        type: String,
        required: true,
        unique: true,
    },
    sessionDuration: Number,
    startDate: Date,
    endDate: Date,
    startTime: String,
    active: {
        type: Boolean,
        default: true,
    },
    category: {
        type: ObjectId,
        ref: 'Category',
    },
    subcategories: {
        type: ObjectId,
        ref: 'Category',
    },
    description: {
        type: String,
        required: true,
    },
    descriptionBg: {
        type: String,
        default: '',
    },
    descriptionContent: [
        {
            type: {
                type: String,
                enum: Object.values(CONTENT_TYPES),
            },
            content: {
                type: String,
            },

            language: {
                type: String,
            },
        },
    ],
    isPublic: {
        type: Boolean,
        required: true,
        default: true,
    },
    isFeatured: {
        type: Boolean,
        required: true,
        default: false,
    },
    curriculum: [
        {
            name: String,
            lessons: [
                {
                    name: {
                        type: String,
                    },
                    lessonContent: [
                        {
                            type: {
                                type: String,
                                enum: Object.values(CONTENT_TYPES),
                            },
                            content: {
                                type: String,
                            },
                            language: {
                                type: String,
                            },
                        },
                    ],
                    assessment: {
                        type: ObjectId,
                        ref: 'Assessment',
                    },
                },
            ],
            startDateTime: Date,
            endDateTime: Date,
            url: {
                type: String,
                default: '',
            },
            slidoCode: {
                type: String,
                default: '',
            },
            // Per-lecture marker for the hourBefore reminder. Stamped
            // by the 5-min cron once the email has been dispatched.
            // Lives on the curriculum row (not the parent instance) so
            // multi-lesson courses can fire one reminder per lesson
            // independently.
            hourBeforeSentAt: { type: Date, default: null },
        },
    ],
    enrolledUsers: [
        {
            type: ObjectId,
            ref: 'User',
        },
    ],
    teachers: [
        {
            type: ObjectId,
            ref: 'User',
        },
    ],
    contentManagers: [
        {
            type: ObjectId,
            ref: 'User',
        },
    ],
    seminar: {
        type: ObjectId,
        ref: 'Seminar',
    },
    url: {
        type: String,
        default: '',
    },
    slidoCode: {
        type: String,
        default: '',
    },
    coverImage: {
        type: String,
    },
    lessonDays: [Number],
    visible: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    // Reminder email configuration.
    //
    // The cron in services/reminder-service dispatches three reminder
    // types: `dayBefore` (T-1 days before the event), `dayOf` (morning
    // of) and `hourBefore` (~1h before the lecture itself). The single
    // `enabled` toggle turns ALL reminders off; the per-type subject
    // and body override the default template for that type only —
    // blank fields fall back to the default. Body placeholders:
    // {{userName}}, {{instanceName}}, {{startDate}}, {{startTime}},
    // {{instanceUrl}}, {{streamUrl}}, {{lectureName}} (hourBefore
    // only, the curriculum row's name).
    //
    // Schema change from the v1.15.0 flat shape (single subject/body
    // shared across types) to the per-type nested shape below — any
    // pre-existing overrides on old instances will simply default to
    // blank and the system will fall back to the default templates.
    reminderEmail: {
        enabled: { type: Boolean, default: true },
        dayBefore: {
            subject: { type: String, default: '' },
            body: { type: String, default: '' },
        },
        dayOf: {
            subject: { type: String, default: '' },
            body: { type: String, default: '' },
        },
        hourBefore: {
            subject: { type: String, default: '' },
            body: { type: String, default: '' },
        },
    },
    // Idempotency markers for the per-instance reminder types. The
    // cron sets these once a batch has been dispatched (even with
    // partial per-recipient failures) so each type fires exactly once
    // per instance. `hourBefore` is per-LECTURE not per-instance — its
    // marker lives on each curriculum row (curriculum[i].hourBeforeSentAt)
    // so a 10-lesson course fires 10 distinct hourBefore reminders.
    reminderSentAt: {
        dayBefore: { type: Date, default: null },
        dayOf: { type: Date, default: null },
    },
});

export default mongoose.model('SeminarInstance', seminarInstanceSchema);
