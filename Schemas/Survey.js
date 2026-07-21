import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const surveySchema = new mongoose.Schema({
    name: String,
    activeFrom: Date,
    activeUntil: Date,
    questions: [],
    answers: {
        type: Array,
        of: {
            userAnswers: [],
            user: {
                type: String,
                ref: 'User',
            },
        },
    },
    courseInstance: {
        type: ObjectId,
        ref: 'CourseInstance',
        default: null,
    },
    seminar: {
        type: ObjectId,
        ref: 'Seminar',
        default: null,
    },
    participants: {
        type: [String],
        ref: 'User',
    },
});

export default mongoose.model('Survey', surveySchema);
