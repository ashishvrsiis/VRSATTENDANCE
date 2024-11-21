const User = require('../models/User');

const getTeamHierarchy = async () => {
    try {
        // Fetch super admin
        const superAdmin = await User.findOne({ role: 1 });
        if (!superAdmin) {
            throw new Error('No Super Admin found');
        }

        // Fetch admins and managers
        const admins = await User.find({ role: 2 });
        const managers = await User.find({ role: 3 });

        // Build hierarchy
        const hierarchy = {
            superAdmin: {
                name: superAdmin.name,
                email: superAdmin.email,
                admins: [],
                managers: [],
            },
        };

        if (admins.length > 0) {
            // If admins exist, populate managers under admins
            for (const admin of admins) {
                const adminManagers = managers.filter(manager => manager.managerId?.toString() === admin._id.toString());

                const adminHierarchy = {
                    name: admin.name,
                    email: admin.email,
                    managers: [],
                };

                // Populate each admin's managers and their employees
                for (const manager of adminManagers) {
                    const employees = managers.filter(emp => emp.managerId?.toString() === manager._id.toString());
                    adminHierarchy.managers.push({
                        name: manager.name,
                        email: manager.email,
                        employees: employees.map(emp => ({
                            name: emp.name,
                            email: emp.email,
                        })),
                    });
                }

                hierarchy.superAdmin.admins.push(adminHierarchy);
            }
        } else {
            // If no admins, show managers directly under super admin
            for (const manager of managers) {
                const employees = managers.filter(emp => emp.managerId?.toString() === manager._id.toString());

                hierarchy.superAdmin.managers.push({
                    name: manager.name,
                    email: manager.email,
                    employees: employees.map(emp => ({
                        name: emp.name,
                        email: emp.email,
                    })),
                });
            }
        }

        return hierarchy;
    } catch (error) {
        console.error('Error building team hierarchy:', error.message);
        throw error;
    }
};

module.exports = { getTeamHierarchy };
