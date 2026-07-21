const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const certificateSchema = new mongoose.Schema({
    certificateId: {
        type: String,
        required: true,
    },
    issueDate: {
        type: Date,
        default: Date.now,
    },
    score: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
    },
    user: {
        type: ObjectId,
        ref: 'User',
    },
    courseInstance: {
        type: ObjectId,
        ref: 'CourseInstance',
    },
    course: {
        type: ObjectId,
        ref: 'Course',
    }
});

module.exports = mongoose.model('Certificate', certificateSchema);
