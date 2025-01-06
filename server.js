// Required modules
const https = require('https'); // Import the https module
const compression = require('compression');
const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
const cors = require('cors');
const agent = new https.Agent({ keepAlive: true });

app.use(express.static(__dirname));
// Middleware to serve static files
app.use(cors({
    origin: 'https://gasmetrics.netlify.app/'//'https://chiragbemrr.github.io' // Replace with your allowed origin
}));
// MongoDB connection
const uri = "mongodb+srv://chirag:12345@cluster0.waacz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

// Helper function to format ISO date to dd-mm-yyyy HH:MM:SS
function formatDateTime(isoDate) {
    const date = new Date(isoDate);

    // Adjust for timezone offset
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + userTimezoneOffset);

    // Extract date and time components
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
        await client.connect();
        const collection = client.db('gassy').collection('gassy');

        const latestRecord = await collection.find({}).sort({ Date: -1 }).limit(1).toArray();

        if (latestRecord.length > 0) {
            const dateStr = latestRecord[0].Date;
            //res.set('Cache-Control', 'public, max-age=3600');
            res.json({
                latestTime: formatDateTime(dateStr),
                latestEmission: latestRecord[0].CO_Emissions_ppm,
                CO2: latestRecord[0].CO2_Emission_PPM,
                Temperature: latestRecord[0].temperature_C,
                Humidity: latestRecord[0].humidity
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
        await client.connect();
        const collection = client.db('gassy').collection('gassy');

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
        res.set('Cache-Control', 'public, max-age=3600');
        res.json(dailyAverages);
    } catch (error) {
        console.error('Error fetching daily averages:', error);
        res.status(500).json({ error: 'Failed to fetch daily averages' });
    }
});

// Route: Get emissions data for the last 15 minutes (CO)
app.get('/api/emissions/15min', async (req, res) => {
    try {
        await client.connect();
        const collection = client.db('gassy').collection('gassy');

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

// Route: Get emissions data for the last 15 minutes (CO2)
app.get('/api/emissions/15minco2', async (req, res) => {
    try {
        await client.connect();
        const collection = client.db('gassy').collection('gassy');

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
        await client.connect();
        const collection = client.db('gassy').collection('gassy');

        const pipeline = [
            {
                $project: {
                    _id: 0,
                    CO_Emissions_ppm: { $round: ['$CO_Emissions_ppm', 2] }
                }
            }
        ];

        const responseData = await collection.aggregate(pipeline).toArray();
         res.set('Cache-Control', 'public, max-age=3600');
        res.json(responseData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve data' });
    } finally {
        await client.close();
    }
});
// Route: Session-based data
app.get('/api/emissions/session', async (req, res) => {
    try {
        await client.connect();
        const collection = client.db('gassy').collection('gassy');

        const pipeline = [
            {
                $project: {
                    _id: 0,
                    time: ['$Date'],
                    CO: { $round: ['$CO_Emissions_ppm', 2] },
                    CO2: { $round: ['$CO2_Emission_PPM', 2] }
                }
            }
        ];

        const responseData = await collection.aggregate(pipeline).toArray();
        const sortedData = responseData.sort((a, b) => new Date(a.time) - new Date(b.time));
        res.set('Cache-Control', 'public, max-age=3600');
        res.json(sortedData);
    } catch (error) {
        console.error('Error fetching session data:', error);
        res.status(500).json({ error: 'Failed to retrieve session data' });
    }
});
app.use(compression());
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
