const fetch = require('node-fetch')

const util  = require('../util/common')
const slack = require('../util/slack')

/**
 * Http Request
 * @param service 서비스정보
 * @param options  부가옵션
 * @returns {Promise<{}>}
 */
exports.request = async (service, options) => {
	// console.log(service.options)
	let apiParse = {}
	await fetch(service.url, options = service.options)
		.then(function (res) {
			if (!res.ok) {
				util.logs.warn(options.apiName + '_NETWORK_FAILED :: ' + res.statusText)
				apiParse = {
					code   : options.apiName + '_NETWORK_FAILED',
					message: options.apiName + '_NETWORK_FAILED :: ' + res.statusText
				}
				if (options.isSlack)
					slack.send(options.apiName + '_NETWORK_FAILED\n' + res.statusText + '\n' + util.logs.time)
				return
			}
			return res.text()
		})
		.then(function (body) {
			apiParse = body
		})
		.catch(function (err) {
			util.logs.error(options.apiName + '_FAILED_LOAD :: ' + err.message)
			apiParse = {
				code   : options.apiName + '_FAILED_LOAD',
				message: options.apiName + '_FAILED_LOAD :: ' + err.message
			}
			if (options.isSlack)
				slack.send(options.apiName + '_FAILED_LOAD\n' + err.message + '\n' + util.logs.time)
		})
	return apiParse
}