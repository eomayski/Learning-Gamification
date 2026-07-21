import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
import { CONTENT_TYPES, EXAM_TYPES } from '../constants';

const courseInstanceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
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
                required: true,
            },
            content: {
                type: String,
            },

            language: {
                type: String,
            },
        },
    ],
    isLive: {
        type: Boolean,
        required: true,
    },
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
    isTracked: {
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
                        required: true,
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
                    completedBy: [
                        {
                            user: {
                                type: ObjectId,
                                ref: 'User',
                            },
                            completedAt: {
                                type: Date,
                                default: Date.now,
                            },
                        },
                    ],
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
            // Per-lecture marker for the hourBefore reminder. See
            // SeminarInstance.js for the full explanation. 5-min cron
            // stamps after dispatch.
            hourBeforeSentAt: { type: Date, default: null },
        },
    ],
    exams: [
        {
            type: ObjectId,
            ref: 'Assessment',
        },
    ],
    certificates: [
        {
            type: ObjectId,
            ref: 'Certificate',
        },
    ],
    hasCertificate: {
        type: Boolean,
        default: false,
    },
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
    course: {
        type: ObjectId,
        ref: 'Course',
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
    // Payment tracking for enrolled users
    paidUsers: [
        {
            user: {
                type: ObjectId,
                ref: 'User',
            },
            paidAt: {
                type: Date,
                default: Date.now,
            },
            amount: Number,
            paymentIntentId: String,
        },
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    // Reminder email configuration — see SeminarInstance.js for the
    // full explanation. For courses the dayBefore/dayOf triggers fire
    // off the FIRST lesson's startDateTime (curriculum[0]); hourBefore
    // fires per-lecture from each curriculum row, so a 10-lesson course
    // sends 10 hourBefore emails (one per lesson, ~1h before its start).
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
    reminderSentAt: {
        dayBefore: { type: Date, default: null },
        dayOf: { type: Date, default: null },
    },
});

export default mongoose.model('CourseInstance', courseInstanceSchema);
