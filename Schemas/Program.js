import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const programSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    nameBg: {
        type: String,
        default: '',
    },
    cid: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        required: true,
    },
    descriptionBg: {
        type: String,
        default: '',
    },
    longDescription: {
        type: String,
    },
    longDescriptionBg: {
        type: String,
        default: '',
    },
    // Ordered list of courses in this program
    courses: [
        {
            course: {
                type: ObjectId,
                ref: 'Course',
                required: true,
            },
            order: {
                type: Number,
                required: true,
            },
            // Prerequisites for this specific course within the program
            // (must complete these courses in the program first)
            prerequisites: [
                {
                    type: ObjectId,
                    ref: 'Course',
                },
            ],
        },
    ],
    // Program metadata
    difficulty: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner',
    },
    estimatedDuration: {
        // Duration in weeks
        type: Number,
    },
    category: {
        type: ObjectId,
        ref: 'Category',
    },
    subcategories: {
        type: ObjectId,
        ref: 'Category',
    },
    coverImage: {
        type: String,
    },
    icon: {
        type: String,
    },
    // What students will learn
    learningOutcomes: [
        {
            type: String,
        },
    ],
    // Who this program is for
    targetAudience: [
        {
            type: String,
        },
    ],
    // Requirements before starting
    requirements: [
        {
            type: String,
        },
    ],
    // Career paths this program enables
    careerPaths: [
        {
            type: String,
        },
    ],
    // Visibility and featured status
    visible: {
        type: Boolean,
        default: true,
    },
    isFeatured: {
        type: Boolean,
        default: false,
    },
    // Enrollment tracking
    enrolledUsers: [
        {
            user: {
                type: ObjectId,
                ref: 'User',
            },
            enrolledAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],
    completedByUsers: [
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
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Indexes for performance
programSchema.index({ cid: 1 }, { unique: true });
programSchema.index({ visible: 1, isFeatured: 1 });
programSchema.index({ 'enrolledUsers.user': 1 });
programSchema.index({ category: 1 });

// Virtual field to get total course count
programSchema.virtual('totalCourses').get(function () {
    return this.courses.length;
});

// Method to calculate user's progress in this program
programSchema.methods.calculateProgress = function (userCompletedCourses) {
    if (!this.courses.length) return 0;

    const completedCount = this.courses.filter((programCourse) =>
        userCompletedCourses.some(
            (completedCourseId) => completedCourseId.toString() === programCourse.course.toString()
        )
    ).length;

    return Math.round((completedCount / this.courses.length) * 100);
};

// Method to get next course user should take
programSchema.methods.getNextCourse = function (userCompletedCourses) {
    // Sort courses by order
    const sortedCourses = [...this.courses].sort((a, b) => a.order - b.order);

    for (const programCourse of sortedCourses) {
        const isCompleted = userCompletedCourses.some(
            (completedCourseId) => completedCourseId.toString() === programCourse.course.toString()
        );

        if (!isCompleted) {
            // Check if prerequisites are met
            const prerequisitesMet = programCourse.prerequisites.every((prereqId) =>
                userCompletedCourses.some(
                    (completedCourseId) => completedCourseId.toString() === prereqId.toString()
                )
            );

            if (prerequisitesMet) {
                return programCourse.course;
            }
        }
    }

    return null; // All courses completed or no available courses
};

// Method to check if user can enroll in this program
programSchema.methods.canUserEnroll = function (userId) {
    return !this.enrolledUsers.some((enrollment) => enrollment.user.toString() === userId.toString());
};

// Method to check if user completed the program
programSchema.methods.isCompletedByUser = function (userId, userCompletedCourses) {
    if (!this.courses.length) return false;

    return this.courses.every((programCourse) =>
        userCompletedCourses.some(
            (completedCourseId) => completedCourseId.toString() === programCourse.course.toString()
        )
    );
};

// Update timestamp on save
programSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

export default mongoose.model('Program', programSchema);
