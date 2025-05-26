const axios = require('axios');
const xlsx = require('xlsx');
const path = require('path');
const { MongoClient } = require('mongodb');

// === Configurations ===
const EXCEL_FILE_PATH = path.join(__dirname, 'users.xlsx');
const PROJECT_TAG = 'Non - Urgent Task';

const MONGO_URI = 'mongodb://localhost:27017'; // Update if needed
const DB_NAME = 'local'; // Replace with your actual DB name
const USERS_COLLECTION = 'users';

const API_BASE_URL = 'https://atms.vrsiis.com:8182/api/v1';
const LOGIN_URL = `${API_BASE_URL}/auth/token`;
const ASSIGN_TAG_URL = 'https://atms.vrsiis.com:8182/api/v1/user/user-project-tags/assign-project-tag';

const ADMIN_CREDENTIALS = {
  email: 'hr@vrsiis.com',
  password: 'Human@123',
};

// === Helper Functions ===

const getAuthToken = async () => {
  try {
    const response = await axios.post(LOGIN_URL, ADMIN_CREDENTIALS);
    return response.data.access;
  } catch (err) {
    console.error('❌ Login failed:', err.response?.data || err.message);
    process.exit(1);
  }
};

const readExcelFile = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
};

const getUserIdByEmail = async (client, email) => {
  const db = client.db(DB_NAME);
  const user = await db.collection(USERS_COLLECTION).findOne({ email });
  return user?._id?.toString();
};

const assignTagToUser = async (token, userId, projectTag) => {
  try {
    console.log("🔄 Assigning:", { userId, projectTag });
await axios.post(
  ASSIGN_TAG_URL,
  { userId, projectTag },
  { headers: { Authorization: `Bearer ${token}` } }
);
    console.log(`✅ Assigned tag to user: ${userId}`);
  } catch (err) {
    console.error(`❌ Failed to assign tag to user ${userId}:`, err.response?.data || err.message);
  }
};

const run = async () => {
  const token = await getAuthToken();
  const usersData = readExcelFile(EXCEL_FILE_PATH);

  const client = new MongoClient(MONGO_URI);
  await client.connect();

  for (const user of usersData) {
    const email = user.email || user.Email;
    if (!email) continue;

    const userId = await getUserIdByEmail(client, email.trim());
    if (!userId) {
      console.warn(`⚠️ User not found for email: ${email}`);
      continue;
    }

    await assignTagToUser(token, userId, PROJECT_TAG);
  }

  await client.close();
  console.log('🎉 All user tags processed.');
};

run();
