const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    fatherName: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: Number, enum: [1, 2, 3], required: true },
    phone: { type: String },
    employeeId: { type: String, required: true, unique: true },
    address: { type: String },
    profileImage: { type: String }, // URL or file path to the profile image
    dateOfBirth: { type: Date }, // Date format for DOB
    position: { type: String },
    managerName: { type: String, default: null }, // Added field for manager's name
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the manager's ID
    managerEmail: { type: String, default: null }, // Store the manager's email instead of name
    managerRole: { type: String, default: null }, // Optional field
    workLocation: { type: String, default: null }, // Optional field
    website: { type: String, default: null }, // Optional field
    deviceToken: { type: String },
    isApproved: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
    manager: { type: Boolean, default: false },
    otpEnabled: { type: Boolean, default: false },
    UserTags: { type: [String], default: [] }
});


// Password hashing middleware
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Password comparison method
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Post-find middleware to update manager field
userSchema.post('find', async function (docs) {
    for (const doc of docs) {
        if (doc.role === 3) {
            const isAssignedAsManager = await mongoose.model('User').exists({ managerEmail: doc.email });
            if (doc.manager !== !!isAssignedAsManager) {
                doc.manager = !!isAssignedAsManager;
                await doc.save(); // Save updated manager field
            }
        }
    }
});

userSchema.post('findOne', async function (doc) {
    if (doc && doc.role === 3) {
        const isAssignedAsManager = await mongoose.model('User').exists({ managerEmail: doc.email });
        if (doc.manager !== !!isAssignedAsManager) {
            doc.manager = !!isAssignedAsManager;
            await doc.save(); // Save updated manager field
        }
    }
});

userSchema.post('find', async function (docs) {
    for (const doc of docs) {
        if (doc.role === 3) { // Manager
            const hasReports = await mongoose.model('User').exists({ managerId: doc._id }); // Use managerId
            if (doc.manager !== !!hasReports) {
                doc.manager = !!hasReports;
                await doc.save(); // Save updated manager field
            }
        }
    }
});


const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;

