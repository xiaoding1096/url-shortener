const http = require('http')
const url = require('url')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const PORT = process.env.PORT || 3000
const DATABASE_FILE = path.join(process.cwd(), 'database.json')
function readDB() {
    if (!fs.existsSync(DATABASE_FILE)) return []
    try {
        const database = fs.readFileSync(DATABASE_FILE, 'utf-8')
        if (database.trim() === '') return []
        return JSON.parse(database)
    } catch (error) {
        console.error('khong the doc du lieu database', error.message)
        return []
    }
}
function writeDB(database) {
    const jsonDatabase = JSON.stringify(database, null, 2)
    return fs.writeFileSync(DATABASE_FILE, jsonDatabase, 'utf-8')
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', (chunk) => {
            chunks.push(chunk)
        })
        req.on('end', () => {
            try {
                const body = Buffer.concat(chunks).toString('utf-8')
                if (body.trim() === '') {
                    resolve({})
                    return
                }
                resolve(JSON.parse(body))
                return
            } catch (error) {
                reject(new Error('khong the lay body tu readBody', error.message))
                return
            }
        })
        req.on('error', reject)
    })
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
}

function generateShortCode() {
    return crypto.randomBytes(4).toString('hex').slice(0, 6)
}
function isValidUrl(bodyURL) {
    try {
        const parsed = new URL(bodyURL)
        const isHttp = parsed.protocol === 'http:'
        const isHttps = parsed.protocol === 'https:'
        const isValid = isHttp || isHttps
        return isValid
    } catch (error) {
        return false
    }
}
async function handleRequest(req, res) {
    const method = req.method
    const { pathname } = url.parse(req.url, true)
    const parts = pathname.split('/')
    if (method === 'GET' && parts[1] === 'shorten' && parts[2]) {
        const shortCode = parts[2]
        const subPath = parts[3]

        const db = readDB()
        const item = db.find(item => item.shortCode === shortCode)
        if (!item) return sendJSON(res, 404, { error: 'khong tim thay shortcode' })
        if (subPath === 'stats') {
            return sendJSON(res, 200, { item })

        } else {
            const now = new Date().toISOString()
            item.accessCount++
            item.updatedAt = now
            writeDB(db)
            sendJSON(res, 200, { item })
            return
        }
    }
    if (method === 'POST' && pathname === '/shorten') {

        const body = await readBody(req)

        if (!body.url) return sendJSON(res, 400, { error: 'thieu truong url trong body' })
        const valid = isValidUrl(body.url)
        if (!valid) return sendJSON(res, 400, { error: 'url khong hop le' })
        const db = readDB()
        let shortCode
        do {
            shortCode = generateShortCode()
        } while (db.find(item => item.shortCode === shortCode))
        const now = new Date().toISOString()
        const newUrl = {
            id: String(Date.now()),
            url: body.url,
            shortCode: shortCode,
            createdAt: now,
            updatedAt: now,
            accessCount: 0
        }
        db.push(newUrl)
        writeDB(db)
        sendJSON(res, 201, { newUrl })
        return
    }
    if (method === 'PUT' && parts[1] === 'shorten' && parts[2]) {
        const body = await readBody(req)
        if (!body.url) return sendJSON(res, 400, { error: 'thieu truong url trong body' })
        const valid = isValidUrl(body.url)
        if (!valid) return sendJSON(res, 400, { error: 'url khong hop le' })
        const shortCode = parts[2]
        const db = readDB()
        const item = db.find(item => item.shortCode === shortCode)
        if (!item) return sendJSON(res, 404, { message: 'khong tim thay shortCode' })
        item.url = body.url
        const now = new Date().toISOString()
        item.updatedAt = now
        writeDB(db)
        sendJSON(res, 200, { item })
        return
    }
    if (method === 'DELETE' && parts[1] === 'shorten' && parts[2]) {
        const shortCode = parts[2]
        const db = readDB()
        const item = db.find(item => item.shortCode === shortCode)
        if (!item) return sendJSON(res, 404, { message: 'khong tim thay shortcode' })
        const newDB = db.filter(item => item.shortCode !== shortCode)
        writeDB(newDB)
        res.writeHead(204)
        res.end()
        return
    }
    if (method === 'GET' && pathname === '/debug-db') {
        const db = readDB()
        return sendJSON(res, 200, db)
    }

    sendJSON(res, 404, { error: 'route is not found' })
}
const server = http.createServer(handleRequest)
server.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`)
})