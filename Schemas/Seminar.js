import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

import { CONTENT_TYPES } from '../constants';

const seminarSchema = new mongoose.Schema({
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
            // startDateTime / endDateTime removed — see Course.js for full
            // reasoning. Seminar is a template; SeminarInstance owns the
            // real calendar dates.
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
    seminarInstances: [
        {
            type: ObjectId,
            ref: 'SeminarInstance',
        },
    ],
    coverImage: {
        type: String,
    },
    visible: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.model('Seminar', seminarSchema);
