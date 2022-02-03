require('dotenv').config()  // .env 환경설정

const _       = require('lodash')
const cheerio = require('cheerio')
const {check} = require('express-validator')

const http = require('../../scraping/httpRequest')
const util = require("../../util/common");

let PARAMS = {};

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
			max: 20
		})
		.withMessage('최소 1부터 20까지 입력 가능합니다.'),
]

/**
 * 지식인 새글 검색영역
 * @param value  쿼리 파라미터
 * @returns {Promise<{code}|{}|boolean|*[]>}
 */
exports.get = async (value) => {
	// ROUTER 에서 요청된 쿼리 파라미터를 전역변수로 선언.
	PARAMS = value;

	// 해당 검색영역에 해당하는 페이지를 파싱.
	const data = await htmlParsing(`https://kin.naver.com/search/noAnswerList.naver?query=${encodeURI(PARAMS.query)}`);

	// 파싱한 데이터를 가공해서 RETURN
	const listData = await searchList(data);

	let results = {};
	for (let i = 0; i < listData.length; i++) {
		// 질문내용과 답변내용을 얻기위해 검색결과 URI 를 다시 요청하여 Parsing
		const body = await htmlParsing(listData[i]['uri']);
		// const body = await htmlParsing("https://kin.naver.com/qna/detail.nhn?d1id=4&dirId=40306&docId=367378250&qb=7IKs7JeF7J6QIOuylOyaqeyduOymneyEnA==&enc=utf8&section=kin.qna.all&rank=2&search_sort=5&spq=0&mode=answer");

		// {순위 : {질문정보, {질문내용}, {답변내용}}}
		results[i + 1] = _.merge(listData[i], await question(body), await answer(body));
	}

	return {
		searchKeyword: PARAMS['query'],
		posts        : results
	};
}

exports.getPage = async (value) => {
	// 질문내용과 답변내용을 얻기위해 검색결과 URI 를 다시 요청하여 Parsing
	const body = await htmlParsing(value.uri.replace(/%26/g, '&'));

	// {순위 : {질문정보, {질문내용}, {답변내용}}}
	let results = {};
	results[1] = _.merge(await question(body), await answer(body));

	return {
		posts        : results
	};
}

/**
 * Html Parsing
 * @param value	페이지요청 URI
 * @returns {Promise<{code}|{}|boolean|cheerio.Root>}
 */
async function htmlParsing(value) {
	// Http 요청
	const data = await http.request({
		url    : value,
		options: {
			method: 'GET',
			body  : null
		}
	}, {
		apiName: 'NAVER_ANSWERS',
		isSlack: false  // 푸시알림: true(허용), false(차단)
	}, PARAMS)

	// Http 에러발생 시 메시지 return
	if (data.hasOwnProperty('code'))
		return data

	// Undefined, Null 값 체크
	if (_.isUndefined(data) || _.isNull(data))
		return false  // Undefined, Null 있으면 종료

	// Http 요청에 따른 data
	return cheerio.load(data.substring(data.indexOf('<body>'), data.indexOf('</body>')))
}

/**
 * 새글 검색결과 파싱>>가공
 * @param value 검색결과 Body Data
 * @returns {Promise<*[]>}
 */
async function searchList(value) {
	// Http 요청에 따른 Body Data
	const $ = value;

	const results = []
	if (_.isEmpty($('.result_no'))) {	// 요청 키워드에 콘텐츠가 있는지 체크.
		// 있을 시, loop 돌아 정상처리.
		$('.boardtype2 tbody > tr').each(await function (index) {
			// loop 제어
			if (++index > PARAMS.display)
				return false  // 요청 개수만큼 돌다 종료

			const docId  = ($(this).find('td.title a._title').attr('href') || '').split('&')[2].substr(6);	// 지식인 문서 ID
			const docTag = ($(this).find('td.field a').text().replace(" ", "") || '').split(','); // 질문분류
			const title  = $(this).find('td.title a._title').text().replace(/^\s+|\s+$/g, "");  // 답변할 질문찾기 제목(새 질문찾기 검색결과와 실체 콘텐츠 페이지 제목과는 내용이 다를 수 있음.)
			const uri    = $(this).find('td.title a._title').attr('href');  // 질문링크

			results.push({
				docId : docId === undefined ? null : docId,
				docTag: docTag === undefined ? null : docTag,
				title : title === undefined ? null : title,
				uri   : uri === undefined ? null : uri,
			})
		})
	}

	return results
}

/**
 * 질문내용 파싱>>가공
 * @param value 질문내용 Body Data
 * @returns {Promise<{question: {date: (null|string), description: (null|*)}}>}
 */
async function question(value) {
	// Http 요청에 따른 Body Data
	const $ = value;

	const questionName = $('.c-userinfo__left .c-userinfo__author').text().substr(3).replace(/^\s+|\s+$/g, "")	// 질문자 닉네임
	const questionText = $('._questionContentsArea .c-heading__content').text().replace(/^\s+|\s+$/g, "")	// 질문내용
	const questionDate = util.scraping.textTimeFormatter($('.c-userinfo__left .c-userinfo__info').eq(0).text().trim().substr(3, 10))	// 질문일자

	return {
		question: {
			nickName   : questionName === '' ? null : questionName,
			description: questionText === '' ? null : questionText,
			date       : questionDate === '' ? null : questionDate
		}
	}
}

/**
 * 답변내용 파싱>>가공
 * @param value 답변내용 Body Data
 * @returns {Promise<{answer: {date: (null|string), description: (null|*), userId: (null|string)}}>}
 */
async function answer(value) {
	// Http 요청에 따른 Body Data
	const $           = value;
	// 답변노출 div 리스트를 가져온다.
	const answerLists = $('.answer-content__list > div._answer');


	let answer = {};
	for (let i = 0; i < answerLists.length; i++) {
		// 답변자 중에서 지식인체크 박스가 있는지 확인
		const check       = answerLists.eq(i).find("div.adopt-check-box");
		const nickName    = answerLists.eq(i).find(".c-heading-answer__title p.title").text().trim();
		const answerState = check.text().replace(/^\s+|\s+$/g, "");	// 답변 채택유형

		let profileId
		if (nickName === "비공개 답변") {
			profileId = null;
		} else {
			profileId = answerLists.eq(i).find(".c-heading-answer__title .title a").attr('href');	// 답변자 프로필 ID
		}
		const description = answerLists.eq(i).find('._endContentsText.c-heading-answer__content-user').text().replace(/^\s+|\s+$/g, "");	// 답변자 내용
		const answerDate  = util.scraping.textTimeFormatter(answerLists.eq(i).find('.c-heading-answer__content-date').text());	// 답변일자

		answer[i + 1] = {
			nickName   : nickName === "" ? null : nickName,
			answerState: answerState === "" ? null : answerState,
			profileId  : profileId === null ? null : profileId,
			description: description === "" ? null : description,
			answerDate : answerDate === "" ? null : answerDate,
		};
	}

	return {answer}
}