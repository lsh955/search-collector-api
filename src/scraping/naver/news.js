require('dotenv').config()  // .env 환경설정

const _       = require('lodash')
const {check} = require('express-validator')

const http = require('../../scraping/httpRequest')

let PARAMS = {};

/**
 * express router validation
 */
exports.validation = [
	check('query', 'query 가 입력되지 않았습니다.')
		.notEmpty(),
	check('scan', 'scan 가 입력되지 않았습니다.')
		.notEmpty(),
	check('start', 'start 가 입력되지 않았습니다.')
		.notEmpty()
		.isInt({
			min: 1,
			max: 1000
		}).withMessage('최소 1부터 1000까지 입력 가능합니다.'),
	check('display', 'display 가 입력되지 않았습니다.')
		.notEmpty()
		.isInt({
			min: 1,
			max: 100
		})
		.withMessage('최소 1부터 100까지 입력 가능합니다.'),
	check('sort', 'sort 가 입력되지 않았습니다.')
		.notEmpty()
		.isIn(['sim', 'date', 'point'])
		.withMessage('sim, date, point 중 입력 가능합니다.')
]

/**
 * 뉴스 검색영역
 * @param value  쿼리 파라미터
 * @returns {Promise<{code}|{}|boolean|*[]>}
 */
exports.get = async (value) => {
	// ROUTER 에서 요청된 쿼리 파라미터를 전역변수로 선언.
	PARAMS = value;

	// 해당 검색영역에 해당하는 페이지를 파싱.
	const data = await htmlParsing(`https://openapi.naver.com/v1/search/news?query=${encodeURI(value.query)}&start=${value.start}&display=${value.display}&sort=${value.sort}`);

	// 파싱한 데이터를 가공해서 RETURN
	const listData = await searchList(data);

	let results = {};
	for (let i = 0; i < listData.length; i++) {
		// 검색결과 URI 를 다시 요청하여 Parsing
		const body = await htmlParsing(listData[i]['uri']);

		// {순위 : {검색결과}}
		results[i + 1] = _.merge(listData[i], await scanFilter(body))
	}

	return {
		searchKeyword: PARAMS['query'],
		scanKeywords : (PARAMS['scan'] || '').split(','),
		posts        : results
	};
}

/**
 * API REQUEST
 * @param value	API 요청
 * @returns {Promise<{code}|{}|{}>}
 */
async function htmlParsing(value) {
	const results = await http.request({
		url    : value,
		options: {
			method : 'GET',
			headers: {  // 네이버 OPENAPI Client 정보
				'X-Naver-Client-Id'    : process.env.NAVER_CLIENT_ID,
				'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
			}
		}
	}, {
		apiName: 'NAVER_NEWS',
		isSlack: false  // 푸시알림: true(허용), false(차단)
	}, PARAMS)

	// Http 에러발생 시 메시지 return
	if (results.hasOwnProperty('code'))
		return results

	// Undefined, Null 값 체크
	if (_.isUndefined(results) || _.isNull(results))
		return false  // Undefined, Null 있으면 종료

	return results;
}

/**
 * 검색결과 파싱>>가공
 * @param value 검색결과
 * @returns {Promise<*[]>}
 */
async function searchList(value) {
	const results = []
	// index 값이 필요해서 [index, "value"] 조합으로 .entries() 사용
	for (const [index, data] of Object.entries(JSON.parse(value)['items'])) {

		const title       = _.replace(data.title, /(<([^>]+)>)/g, '');	// 제목
		const uri         = _.replace(data.link, /(<([^>]+)>)/g, '');	// URI
		const description = _.replace(data.description, /(<([^>]+)>)/g, '');	// 기사내용

		results.push({
			title      : title === undefined ? null : title,
			description: description === undefined ? null : description,
			uri        : uri === undefined ? null : uri
		})
	}

	return results
}

/**
 * 포스팅 확인>>검증(스캔키워드)
 * @param value 포스팅 html Data
 * @returns {Promise<{scanKeyword: *[]}>}
 */
async function scanFilter(value) {
	// 스캔키워드
	const keyword = (PARAMS['scan'] || '').split(',');

	let results = [];
	for (let i = 0; i < keyword.length; i++) {
		const re = new RegExp(keyword[i], 'g');
		// Parsing 된 Data 에 스캔키워드를 돌려 있는지 없는지 검증한다.
		if (value.search(re) > -1) {
			results.push(keyword[i])
		}
	}

	return {
		scanKeywords: results
	};
}