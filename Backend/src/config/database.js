const mongoose = require("mongoose")

/**
 * Connect to MongoDB.
 *
 * A failure here is fatal: without a database every request would still be
 * accepted but then fail with an opaque 500 once the query timed out, which is
 * far harder to diagnose than the process simply refusing to start. Hosting
 * platforms restart the container, so exiting also gives us a free retry.
 */
async function connectToDB() {

    try {
        await mongoose.connect(process.env.MONGO_URI)

        console.log("Connected to Database")
    }
    catch (err) {
        console.error("Failed to connect to MongoDB:", err.message)
        process.exit(1)
    }
}

module.exports = connectToDB
