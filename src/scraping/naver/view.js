require('dotenv').config()  // .env 환경설정

const _       = require('lodash')
const cheerio = require('cheerio')
const {check} = require('express-validator')

const util = require('../../util/common')
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
		})
		.withMessage('최소 1부터 1000까지 입력 가능합니다.'),
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
 * VIEW 탭 검색영역
 * @param value  쿼리 파라미터
 * @returns {Promise<{code}|{}|boolean|*[]>}
 */
exports.get = async (value) => {
	// ROUTER 에서 요청된 쿼리 파라미터를 전역변수로 선언.
	PARAMS = value;

	// 해당 검색영역에 해당하는 페이지를 파싱.
	const data     = await htmlParsing(`https://search.naver.com/search.naver?where=view&sm=tab_viw.all&query=${encodeURI(PARAMS.query)}&start=${PARAMS.start}&display=${PARAMS.display}&sort=${PARAMS.sort}`);
	// 파싱한 데이터를 가공해서 RETURN
	const listData = await searchList(data);

	let results = {};
	for (let i = 0; i < listData.length; i++) {
		// {순위 : {검색결과, [스캔키워드 결과]}}
		results[i + 1] = _.merge(listData[i], await scanFilter(listData[i]['uri']))
	}

	return {
		searchKeyword: PARAMS['query'],
		scanKeywords : (PARAMS['scan'] || '').split(','),
		posts        : results
	};
}

/**
 * Html Parsing
 * @param value	페이지요청 URI
 * @returns {Promise<{code}|{}|{}>}
 */
async function htmlParsing(value) {
	// Http 요청
	const results = await http.request({
		url    : value,
		options: {
			method: 'GET',
			body  : null
		}
	}, {
		apiName: 'NAVER_VIEW',
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
 * @param value 검색결과 URI
 * @returns {Promise<boolean|*[]>}
 */
async function searchList(value) {
	// Html Parsing data 를 필요 부분만 잘라 사용.
	const $ = cheerio.load(value.substring(value.indexOf('<more-contents>'), value.indexOf('</more-contents>')))

	let results = [];
	$('ul > li').each(async function (index) {
		// loop 제어
		if (++index > PARAMS.display)
			return false  // 요청 개수만큼 돌다 종료

		const officialBlog = _.trim($(this).find('span.etc_dsc_area .api_icon_official2').text());	// 공식블로그
		const inFluencer   = _.trim($(this).find('span.etc_dsc_area .stress').text());	// 인플루언서
		const officialCafe = _.trim($(this).find('span.etc_dsc_area .api_ico_total').text());	// 대표카페

		// 의미가 불 명확한 단어(공식 등) 로 표기되는 문제 때문에,
		// text() 로 그대로 가져와서 사용하기 보다는 직접 문자를 써서 출력.
		let sort;
		if (officialBlog !== "") {
			sort = "공식블로그";
		} else if (inFluencer !== "") {
			sort = "인플루언서";
		} else if (officialCafe !== "") {
			sort = "대표카페";
		} else {
			sort = "해당없음";
		}

		const category    = sort;
		const name        = _.trim($(this).find('a.sub_txt').text() || $(this).find('span.source_txt.name').text());  // 블로그 또는 카페이름
		const title       = _.trim($(this).find('a.api_txt_lines').text());	// 포스팅 제목
		const uri         = $(this).find('a.api_txt_lines').attr('href');	// 포스팅 링크
		const description = _.trim($(this).find('.total_dsc_wrap').text());    // 포스팅 설정
		const date        = util.scraping.textTimeFormatter($(this).find('span.sub_time').text() || $(this).find('span.source_txt.date').text()); // 등록일자

		results.push({
			category   : category === undefined ? null : category,
			name       : name === undefined ? null : name,
			title      : title === undefined ? null : title,
			uri        : uri === undefined ? null : uri,
			description: description === undefined ? null : description,
			date       : date === undefined ? null : date
		});
	})

	return results;
}

/**
 * 포스팅 확인>>검증(스캔키워드)
 * @param value 포스팅 URI
 * @returns {Promise<{scanKeyword: *[]}>}
 */
async function scanFilter(value) {
	const type = value.replace(/(http(s)?:\/\/)/, '').substring(0, 4)

	// 가공된 검색결과 URI 를 요청하여 Parsing
	let data = await htmlParsing(value);

	// Html Parsing data 를 필요 부분만 잘라 사용.
	const $ = cheerio.load(data.substring(data.indexOf('<body>'), data.indexOf('</body>')))

	// 네이버 블로그 iframe 경우
	if (data.search(/#mainFrame/g) > -1)
		data = await htmlParsing('https://blog.naver.com' + $('#mainFrame').attr('src'));

	if (type === 'cafe')
		console.log("네이버 카페는 아직 안됨.")

	// 스캔키워드
	const keyword = (PARAMS['scan'] || '').split(',');

	let results = [];
	for (let i = 0; i < keyword.length; i++) {
		const re = new RegExp(keyword[i], 'g');
		// Parsing 된 Data 에 스캔키워드를 돌려 있는지 없는지 검증한다.
		if (data.search(re) > -1) {
			results.push(keyword[i])
		}
	}

	return {
		scanKeywords: results
	};
}
