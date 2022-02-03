require('dotenv').config()  // .env 환경설정

const express = require('express')
const app     = express()

const util = require('./util/common')

const index = require('./routers/index')
const naver = require('./routers/naver')
const daum  = require('./routers/daum')

const naverRelation = require('./scraping/naver/monthly')
const daumRelation  = require('./scraping/daum/monthly')

app.use('/index', index)               // 서버 상태조회
app.use('/api/daum/search', daum)      // Daum Scraping Routers
app.use('/api/naver/search', naver)    // Naver Scraping Routers

/*
 * 서버상태
 */
let STATUS = 'DOWN'

exports.getStatus = () => {
	return STATUS
}

/*
 * 서버시작
 */
const server = app.listen(process.env.SERVER_PORT, () => {
	util.logs.info('SERVER START... PORT = ' + server.address().port)

	// Kakao 월간검색 수 세션생성
	if (daumRelation.getStatus() === "INITIALIZING")
		daumRelation.sessionStart();

	// Naver 월간검색 수 세션생성
	if (naverRelation.getStatus() === "INITIALIZING")
		naverRelation.sessionStart();

	STATUS = 'OK'
})
