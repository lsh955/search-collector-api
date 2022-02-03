require('dotenv').config()  // .env 환경설정

const _                  = require('lodash')
const moment             = require('moment')
const {validationResult} = require('express-validator')

/**
 * 라우터에 관련된 util
 * @type {{responseForm: ((function(*, *=, *, *=): Promise<*|undefined>)|*)}}
 */
exports.routers = {
	responseForm: async (req, res, funcName) => {
		// 최초 요청부터 완료까지 시간측정을 위한 셋팅.
		const startTime = new Date();

		// 파라미터 조건이 맞지 않는경우, message return
		const validation = validationResult(req).array()

		if (!_.isEmpty(validation)) {
			return res.status(400).json({
				code   : 'VALIDATION_FAILURE',
				message: validation[0].msg
			})
		}

		await funcName.call(null, req.query).then(function (data) {
			// if 문에서 걸릴게 없으면, success return
			return res.status(200).json({
				code    : 'SUCCESS',
				message : '성공',
				doDT    : new Date(),
				data    : data,
				duration: new Date() - startTime
			})
		}).catch(function (err) {
			return res.status(500).json({
				code   : 'FAILURE',
				message: err
			})
		})
	}
}

/**
 * 스크래핑에 관련된 util
 * @type {{textTimeFormatter: (function(*=): string)}}
 */
exports.scraping = {
	// 텍스트 시간을 날짜포멧으로 변경
	textTimeFormatter: (value) => {
		const time = _.replace(value, /\.$/g, '')

		let postDate = time;
		if (time.search(/\d시간 전/g) > -1 || time.search(/\d분 전/g) > -1) {
			postDate = moment().format('YYYY-MM-DD')
		} else if (time.search(/\d일 전/g) > -1) {
			postDate = moment().add(-Number(time.replace(/\D/g, '')), 'd').format('YYYY-MM-DD')
		} else if (time.search(/어제/g) > -1) {
			postDate = moment().add(-1, 'd').format('YYYY-MM-DD')
		}

		return postDate.split('.').join('-');
	}
}

/**
 * DELAY 줄때 사용될 util
 * @type {{sleep: (function(*=): Promise<unknown>)}}
 */
exports.delay = {
	sleep: (ms) => {
		return new Promise(resolve => setTimeout(resolve, ms))
	}
}

/**
 * LOG 찍을때 사용될 util
 * @type {{warn: exports.logs.warn, debug: exports.logs.debug, time: string, error: exports.logs.error, info: exports.logs.info}}
 */
exports.logs = {
	debug: (message) => {
		console.debug(moment().format('YYYY-MM-DDTHH:mm:ss.SSS') + '\tDEBUG\t' + process.env.SERVER_NAME + '\t' + message)
	},
	info : (message) => {
		console.log(moment().format('YYYY-MM-DDTHH:mm:ss.SSS') + '\tINFO\t' + process.env.SERVER_NAME + '\t' + message)
	},
	warn : (message) => {
		console.warn(moment().format('YYYY-MM-DDTHH:mm:ss.SSS') + '\tWARN\t' + process.env.SERVER_NAME + '\t' + message)
	},
	error: (message, e) => {
		console.error(moment().format('YYYY-MM-DDTHH:mm:ss.SSS') + '\tERROR\t' + process.env.SERVER_NAME + '\t' + message, e)
	},
	time : moment().format('YYYY-MM-DD HH:mm:ss.SSS')
}