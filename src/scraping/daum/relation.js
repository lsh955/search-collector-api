require('dotenv').config()  // .env 환경설정

const _       = require('lodash')
const cheerio = require('cheerio')
const {check} = require('express-validator')

const http = require('../../scraping/httpRequest')

/**
 * express router validation
 */
exports.validation = [
	check('query', 'query 가 입력되지 않았습니다.')
		.notEmpty(),
	check('size', 'size 가 입력되지 않았습니다.')
		.notEmpty()
		.isInt({
			min: 1,
			max: 20
		})
		.withMessage('최소 1부터 20까지 입력 가능합니다.')
]

/**
 * 키워드 연관검색어
 * @param params  쿼리 파라미터
 * @returns {Promise<{code}|{}|boolean|{searchKeywordss: string[], posts: {}}>}
 */
exports.get = async (params) => {
	// Http 요청
	const data = await http.request({
		url    : `https://search.daum.net/search?nil_suggest=btn&w=tot&DA=SBC&q=${encodeURI(params.query)}`,
		options: {
			method: 'GET',
			body  : null
		}
	}, {
		apiName: 'DAUM_KEYWORDS', // 서비스 이름
		isSlack: false            // 푸시알림: true(허용), false(차단)
	}, params)

	// Http 에러발생 시 메시지 return
	if (data.hasOwnProperty('code'))
		return data

	// Http 요청에 따른 data
	const $ = cheerio.load(data.substring(data.indexOf('<body>'), data.indexOf('</body>')))

	// Undefined, Null 값 체크
	if (_.isUndefined($) || _.isNull($))
		return false  // Undefined, Null 있으면 종료

	let results = {};
	$('div.content_keyword ul li').each(await function (index) {
		// loop 제어
		if (++index > params.size)
			return false  // 요청 개수만큼 돌다 종료

		const keyword = $(this).find('span.txt_keyword').text();	// 연관키워드
		const uri     = 'https://search.daum.net/search' + $(this).find('a').attr('href');	  // 연관키워드 링크

		results[index] = {
			keyword: keyword === undefined ? null : keyword,
			uri    : uri === undefined ? null : uri
		}
	})

	return {
		searchKeyword: PARAMS['query'],
		posts        : results
	};
}