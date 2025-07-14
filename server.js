// Required modules
const https = require('https');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const agent = new https.Agent({ keepAlive: true });

const MONGO_URI = "mongodb+srv://chirag:12345@cluster0.waacz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(MONGO_URI);
let db;

// Initialize middleware
// app.use(cors({ origin: 'https://chiragbemrr.github.io' }));
const allowedOrigins = [
  'https://chiragbemrr.github.io', // GitHub Pages app
  'https://zp1v56uxy8rdx5ypatb0ockcb9tr6a-oci3--8081--96435430.local-credentialless.webcontainer-api.io',
  'https://guileless-cocada-582f17.netlify.app'
];

// app.use(cors({
//   origin: function (origin, callback) {
//     // Allow requests with no origin (like mobile apps or curl)
//     if (!origin) return callback(null, true);
//     if (allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     } else {
//       return callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true  // Only if you are using cookies or Authorization headers
// }));
app.use(cors({
  origin: function (origin, callback) {
    console.log('Incoming origin:', origin);  // <-- Add this
    if (!origin) return callback(null, true); // Mobile/native/curl etc.

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));


app.use(compression());

// Connect to MongoDB once and reuse the connection
async function connectToDatabase() {
    if (!db) {
        try {
            await client.connect();
            db = client.db('gassy');
            console.log("Connected to MongoDB");
        } catch (error) {
            console.error("Failed to connect to MongoDB:", error);
            process.exit(1);
        }
    }
    return db;
}

// Helper function to format ISO date to dd-mm-yyyy HH:MM:SS
function formatDateTime(isoDate) {
    const date = new Date(isoDate);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
    const day = adjustedDate.getDate().toString().padStart(2, '0');
    const month = (adjustedDate.getMonth() + 1).toString().padStart(2, '0');
    const year = adjustedDate.getFullYear();
    const hours = adjustedDate.getHours().toString().padStart(2, '0');
    const minutes = adjustedDate.getMinutes().toString().padStart(2, '0');
    const seconds = adjustedDate.getSeconds().toString().padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

// Route: Get latest emissions data
app.get('/api/emissions/latest', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('gassy');
        const latestRecord = await collection.find({}).sort({ Date: -1 }).limit(1).toArray();

        if (latestRecord.length > 0) {
            const record = latestRecord[0];
            res.json({
                latestTime: formatDateTime(record.Date),
                latestEmission: record.CO_Emissions_ppm,
                CO2: record.CO2_Emission_PPM,
                Temperature: record.temperature_C,
                Humidity: record.humidity
            });
        } else {
            res.status(404).json({ error: 'No data found' });
        }
    } catch (error) {
        console.error('Error fetching latest emissions:', error);
        res.status(500).json({ error: 'Failed to fetch latest data' });
    }
});

// Route: Get daily averages of emissions
app.get('/api/emissions/daily-averages', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('gassy');
        const dailyAverages = await collection.aggregate([
            {
                $group: {
                    _id: { $substr: ['$Date', 0, 10] },
                    average: { $avg: { $toDouble: '$CO_Emissions_ppm' } },
                    average_co2: { $avg: { $toDouble: '$CO2_Emission_PPM' } },
                    max_co: { $max: { $toDouble: '$CO_Emissions_ppm' } },
                    min_co: { $min: { $toDouble: '$CO_Emissions_ppm' } },
                    max_co2: { $max: { $toDouble: '$CO2_Emission_PPM' } },
                    min_co2: { $min: { $toDouble: '$CO2_Emission_PPM' } }
                }
            },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    average: { $round: ['$average', 2] },
                    average_co2: { $round: ['$average_co2', 2] },
                    max_co: { $round: ['$max_co', 2] },
                    min_co: { $round: ['$min_co', 2] },
                    max_co2: { $round: ['$max_co2', 2] },
                    min_co2: { $round: ['$min_co2', 2] }
                }
            },
            { $sort: { date: 1 } }
        ]).toArray();
        //res.set('Cache-Control', 'public, max-age=3600');
        res.json(dailyAverages);
    } catch (error) {
        console.error('Error fetching daily averages:', error);
        res.status(500).json({ error: 'Failed to fetch daily averages' });
    }
});

// Route: Get last 15 minutes of CO data
app.get('/api/emissions/15min', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('gassy');

        const latestRecord = await collection.find({}).sort({ Date: -1 }).limit(1).toArray();
        if (!latestRecord.length) return res.status(404).json({ error: 'No data found' });

        const latestTime = new Date(latestRecord[0].Date);
        const fifteenMinutesAgo = new Date(latestTime.getTime() - 15 * 60 * 1000);

        const last15MinData = await collection
            .find({ Date: { $gte: fifteenMinutesAgo, $lte: latestTime } })
            .sort({ Date: 1 })
            .toArray();

        const responseData = last15MinData.map(record => ({
            time: record.Date,
            emission: record.CO_Emissions_ppm
        }));
        res.json({ last15MinData: responseData });
    } catch (error) {
        console.error('Error fetching last 15 minutes of data:', error);
        res.status(500).json({ error: 'Failed to fetch last 15 minutes of data' });
    }
});

// Route: Get last 15 minutes of CO2 data
app.get('/api/emissions/15minco2', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('gassy');

        const latestRecord = await collection.find({}).sort({ Date: -1 }).limit(1).toArray();
        if (!latestRecord.length) return res.status(404).json({ error: 'No data found' });

        const latestTime = new Date(latestRecord[0].Date);
        const fifteenMinutesAgo = new Date(latestTime.getTime() - 15 * 60 * 1000);

        const last15MinData = await collection
            .find({ Date: { $gte: fifteenMinutesAgo, $lte: latestTime } })
            .sort({ Date: 1 })
            .toArray();

        const responseData = last15MinData.map(record => ({
            time: record.Date,
            emission: record.CO2_Emission_PPM
        }));
        res.json({ last15MinData: responseData });
    } catch (error) {
        console.error('Error fetching last 15 minutes of CO2 data:', error);
        res.status(500).json({ error: 'Failed to fetch last 15 minutes of CO2 data' });
    }
});

app.get('/api/emissions/pi', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('gassy');

        const pipeline = [
            {
                $project: {
                    _id: 0,
                    date: '$Date',
                    CO_Emissions_ppm: { $round: ['$CO_Emissions_ppm', 2] }
                }
            }
        ];

        const responseData = await collection.aggregate(pipeline).toArray();
       // res.set('Cache-Control', 'public, max-age=3600');
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching pi data:', error);
        res.status(500).json({ error: 'Failed to retrieve data' });
    }
});

// Route: Session-based data
app.get('/api/emissions/session', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const collection = db.collection('gassy');

        const pipeline = [
            {
                $project: {
                    _id: 0,
                    time: ['$Date'],
                    CO: { $round: ['$CO_Emissions_ppm', 2] },
                    CO2: { $round: ['$CO2_Emission_PPM', 2] }
                }
            },
            { $sort: { time: 1 } }
        ];

        const responseData = await collection.aggregate(pipeline).toArray();
        res.set('Cache-Control', 'public, max-age=3600');
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching session data:', error);
        res.status(500).json({ error: 'Failed to retrieve session data' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
