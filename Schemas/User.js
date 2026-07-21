import mongoose from 'mongoose';
const bcrypt = require('bcrypt');
import { ROLES } from '../constants';
const { ObjectId } = mongoose.Schema.Types;

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        validate: {
            validator: v => v && v.length > 0,
            message: 'Email cannot be empty.',
        },
    },
    password: {
        type: String,
    },
    verified: {
        type: Boolean,
        default: false,
    },
    private: {
        type: Boolean,
        default: false,
    },
    roles: {
        type: [String],
        enum: Object.values(ROLES),
        default: [ROLES.USER],
    },
    certificates: {
        type: [ObjectId],
        ref: 'Certificate',
        default: [],
    },
    enrolledCourseInstances: {
        type: [ObjectId],
        ref: 'CourseInstance',
        default: [],
    },
    enrolledSeminarInstances: {
        type: [ObjectId],
        ref: 'SeminarInstance',
        default: [],
    },
    enrolledAssessments: {
        type: [ObjectId],
        ref: 'Assessment',
        default: [],
    },
    successfullyCompletedCourses: {
        type: [ObjectId],
        ref: 'Course',
        default: [],
    },
    // Program enrollment tracking
    enrolledPrograms: {
        type: [ObjectId],
        ref: 'Program',
        default: [],
    },
    completedPrograms: {
        type: [ObjectId],
        ref: 'Program',
        default: [],
    },
    managedCourseInstances: {
        type: [ObjectId],
        ref: 'CourseInstance',
    },
    managedSeminarInstances: {
        type: [ObjectId],
        ref: 'SeminarInstance',
    },
    taughtCourseInstances: {
        type: [ObjectId],
        ref: 'CourseInstance',
    },
    taughtSeminarInstances: {
        type: [ObjectId],
        ref: 'SeminarInstance',
    },
    teacherInfo: {
        firstName: String,
        lastName: String,
        firstNameBg: String,
        lastNameBg: String,
        bio: String,
        bioBg: String,
        cid: String,
        videoUrl: String,
        avatarUrl: String,
    },
    generalInfo: {
        firstName: {
            type: String,
            default: '',
        },
        secondName: {
            type: String,
            default: '',
        },
        surname: {
            type: String,
            default: '',
        },
        avatarUrl: {
            type: String,
            default: '',
        },
        // Contact phone captured on the first paid enrollment and
        // reused thereafter. Kept next to the three names so the
        // whole "who to contact for this transfer" bundle lives in
        // one place rather than a separate contactInfo doc.
        phone: {
            type: String,
            default: '',
        },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

userSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

export default mongoose.model('User', userSchema);
