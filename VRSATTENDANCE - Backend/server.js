const fs = require('fs');
// const https = require('https');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const userRoutes = require('./routes/userRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const notificationdeliveryRoutes = require('./routes/notificationdeliveryRoutes');
const attendanceRegularizationRoutes = require('./routes/attendanceRegularizationRoutes');
const taskRoutes = require('./routes/taskRoutes');
const eventRoutes = require('./routes/eventRoutes');
const recentActivitiesRoutes = require('./routes/recentActivitiesRoutes');
const policyRoutes = require('./routes/policyRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const leaveBalanceRoutes = require('./routes/leaveBalanceRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const bodyParser = require('body-parser');
const { setupWebSocket } = require('./utils/websocket');
const { authenticateUser } = require('./middleware/authenticateToken');
// const notificationRoutes = require('./routes/notificationRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const locationRoutes = require('./routes/locationRoutes');

dotenv.config();

const app = express();
app.use(express.json());

connectDB();

app.get('/', (req, res) => {
    res.send('Server is running');
});


app.use(bodyParser.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', tokenRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/delivery', notificationdeliveryRoutes);
app.use('/api/v1/', attendanceRegularizationRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/', recentActivitiesRoutes);
app.use('/api/v1/', policyRoutes);
app.use('/api/v1/', leaveRoutes);
app.use('/api/v1/leavebalances', leaveBalanceRoutes);
app.use('/api/v1/password-management', passwordRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/location', locationRoutes);

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });
setupWebSocket(wss);

const privateKeyPath = 'C:/Users/ashis/OneDrive/Desktop/Work/VRSATTENDANCE - Backend/myCA.key';
const certificatePath = 'C:/Users/ashis/OneDrive/Desktop/Work/VRSATTENDANCE - Backend/myCA.pem';

const privatekey = fs.readFileSync(privateKeyPath, 'utf8');
const certificate = fs.readFileSync(certificatePath, 'utf8');
const credentials = {key: privatekey, cert: certificate};

const PORT = process.env.PORT || 3000;
const httpsServer = http.createServer(app);
httpsServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server is running on port ${PORT}`);
});

