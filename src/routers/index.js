require('dotenv').config()  // .env 환경설정

const router = require('express').Router()

const server = require('../server')

/**
 * 서버 상태조회
 */
router.get('/health', async function (req, res) {
	await res.status(200).json({
		'status'    : server.getStatus(),
		'serverName': process.env.SERVER_NAME
	})
})

module.exports = router
