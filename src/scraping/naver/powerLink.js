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
	check('display', 'display 가 입력되지 않았습니다.')
		.notEmpty()
		.isInt({
			min: 1,
			max: 100
		})
		.withMessage('최소 1부터 100까지 입력 가능합니다.')
]

/**
 * 파워링크 검색영역
 * @param params  쿼리 파라미터
 * @returns {Promise<{searchKeywords: string[], posts: {}}|{code}|{}|boolean>}
 */
exports.get = async (params) => {
	// Http 요청
	const data = await http.request({
		url    : `https://ad.search.naver.com/search.naver?where=ad&query=${encodeURI(params.query)}`,
		options: {
			method: 'GET',
			body  : null
		}
	}, {
		apiName: 'NAVER_POWERLINK',
		isSlack: false  // 푸시알림: true(허용), false(차단)
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
	// 요청 키워드에 콘텐츠가 있는지 체크.
	if (_.isEmpty($('ol.lst_type'))) {
		// 없을 시, 콘텐츠가 없으므로 따로 메시지 출력.
		results = {
			queryKeyword: params.query,  // 검색 키워드
			message     : '요청하신 키워드에 콘텐츠가 없습니다.'
		}
	} else {
		// 있을 시, loop 돌아 정상처리.
		$('ol.lst_type > li.lst').each(await function (index) {
			// loop 제어
			if (++index > params.display)
				return false  // 요청 개수만큼 돌다 종료

			const title       = _.trim($(this).find('a.lnk_tit').text());	// 사이트 제목
			const description = _.trim($(this).find('p.ad_dsc_inner').text());	// 사이트 설명
			const uri         = _.trim($(this).find('a.url').text());	// 사이트 URI

			results[index] = {
				title      : title === undefined ? null : title,
				description: description === undefined ? null : description,
				uri        : uri === undefined ? null : uri,
			}
		})
	}

	return {
		searchKeyword: PARAMS['query'],
		posts        : results
	};
}