require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');

const API_BASE_URL = 'https://518dhcgx-2000.inc1.devtunnels.ms/api/v1'; // Adjust if needed
const LOGIN_URL = `${API_BASE_URL}/auth/token`;
const REGISTER_URL = `${API_BASE_URL}/auth/register`;

const ADMIN_CREDENTIALS = {
    email: 'ashish@vrsiis.com', // Replace with actual admin email
    password: 'Ashish123' // Replace with actual admin password
};

// Arrays to store success and failed registrations
let successfulRegistrations = [];
let failedRegistrations = [];

// Function to log in and get an auth token
const getAuthToken = async () => {
    try {
        console.log('🔑 Logging in to get access token...');
        const response = await axios.post(LOGIN_URL, ADMIN_CREDENTIALS);

        console.log('✅ Login successful! Received response:', JSON.stringify(response.data, null, 2));
        
        const token = response.data.access; // Correctly extracting the access token

        if (!token) {
            console.error('❌ Error: No access token received in response!');
            process.exit(1);
        }

        console.log('🔍 Access Token:', token);
        return token;
    } catch (error) {
        console.error('❌ Failed to get auth token:', error.response?.data || error.message);
        process.exit(1); // Exit if login fails
    }
};

// Function to read Excel file and return JSON data
const readExcelFile = (filePath) => {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
};

// Function to register multiple users
const registerUsersFromExcel = async (filePath, token) => {
    try {
        console.log('📄 Reading Excel file...');
        const usersData = readExcelFile(filePath);
        console.log(`📊 Found ${usersData.length} users to register.`);

        for (const userData of usersData) {
            try {
                // Assign default password directly (no hashing)
                userData.password = 'DefaultPassword123';
                userData.re_password = 'DefaultPassword123';

                // Log user data before sending request
                console.log(`\n📩 Preparing to register user: ${userData.email}`);
                console.log('📌 User Data:', JSON.stringify(userData, null, 2));

                if (!userData.managerEmail) {
                    console.warn(`⚠️ Warning: No managerEmail provided for ${userData.email}`);
                }

                const response = await axios.post(REGISTER_URL, userData, {
                    headers: { Authorization: `Bearer ${token}` } // Correct token format
                });

                console.log(`✅ Successfully registered: ${userData.email}`);
                successfulRegistrations.push(userData.email);
            } catch (error) {
                const errorMessage = error.response?.data?.message || JSON.stringify(error.response?.data) || error.message;
                console.error(`❌ Failed to register ${userData.email}: ${errorMessage}`);
                failedRegistrations.push({ email: userData.email, reason: errorMessage });
            }
        }

        console.log('🎉 Bulk user registration completed.');
    } catch (error) {
        console.error('⚠️ Error processing Excel file:', error.message);
    }
};

// Main function to authenticate and register users
const startBulkRegistration = async () => {
    const token = await getAuthToken(); // Get auth token first
    const filePath = path.join(__dirname, 'users.xlsx'); // Adjust file path
    await registerUsersFromExcel(filePath, token);

    console.log('\n📋 Registration Summary:');
    console.log(`✅ Successful Registrations (${successfulRegistrations.length}):`);
    successfulRegistrations.forEach(email => console.log(`  - ${email}`));

    console.log(`❌ Failed Registrations (${failedRegistrations.length}):`);
    failedRegistrations.forEach(entry => console.log(`  - ${entry.email}: ${entry.reason}`));
};

startBulkRegistration();
