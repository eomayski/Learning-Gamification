import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

import { CONTENT_TYPES } from '../constants';

const courseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    cid: {
        type: String,
        required: true,
        unique: true,
    },
    active: {
        type: Boolean,
        default: false,
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
    // Marketing content mirroring the AICourseDetail layout — added
    // as optional per-course fields so existing courses without them
    // render unchanged (Details.jsx skips a section when its array is
    // empty). Every field ships in both EN and BG; the site's locale
    // switch picks which one to display, same pattern as description /
    // descriptionBg. Kept as flat String arrays rather than i18n keys
    // because these are admin-authored per course, not shipped in the
    // static aiProfessions catalog.
    longDescription: { type: String, default: '' },
    longDescriptionBg: { type: String, default: '' },
    learningObjectives: { type: [String], default: [] },
    learningObjectivesBg: { type: [String], default: [] },
    topics: { type: [String], default: [] },
    topicsBg: { type: [String], default: [] },
    outcomes: { type: [String], default: [] },
    outcomesBg: { type: [String], default: [] },
    whoIsItFor: { type: [String], default: [] },
    whoIsItForBg: { type: [String], default: [] },
    descriptionContent: [
        {
            type: {
                type: String,
                enum: Object.values(CONTENT_TYPES),
                required: true,
            },
            content: {
                type: String,
                required: true,
            },

            language: {
                type: String,
            },
        },
    ],
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
                },
            ],
            // startDateTime / endDateTime were removed: Course is a template
            // and these dates were never displayed nor consumed - instance
            // creation always recomputes per-section dates via
            // updateCurriculumDates() from the instance startDate + startTime
            // + sessionDuration + lessonDays. Keeping them on the schema only
            // confused admins (two date entry points for the same thing) and
            // collected data the backend immediately overwrote. CourseInstance
            // still owns these fields - that's where real calendar dates live.
            url: {
                type: String,
                default: '',
            },
            slidoCode: {
                type: String,
                default: '',
            },
        },
    ],
    prerequisites: [
        [
            {
                type: ObjectId,
                ref: 'Course',
            },
        ],
    ],
    courseInstances: [
        {
            type: ObjectId,
            ref: 'CourseInstance',
        },
    ],
    certificates: [
        {
            type: ObjectId,
            ref: 'Certificate',
        },
    ],
    coverImage: {
        type: String,
    },
    successfullyCompletedByUsers: {
        type: [ObjectId],
        ref: 'User',
        default: [],
    },
    visible: {
        type: Boolean,
        default: true,
    },
    // Paid course fields
    isPaid: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number,
        default: 0,
        min: 0,
    },
    currency: {
        type: String,
        default: 'EUR',
        enum: ['USD', 'EUR', 'GBP', 'BGN'],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.model('Course', courseSchema);
