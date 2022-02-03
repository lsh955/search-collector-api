require('dotenv').config()  // .env 환경설정

const _             = require('lodash')
const {check}       = require('express-validator')
const puppeteer     = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const slack = require('../../util/slack')
const util  = require('../../util/common')
const http  = require('../../scraping/httpRequest')
const token = require('../../scraping/tokenRequest')

let PAGE          = null;
let BROWSER       = null;
let STATUS        = 'INITIALIZING';
let STATUS_CONST  = true;	// 각 Load 처리에 대한 상태 값(상태 따라 반복실행의 분기처리 용도)
let ACCESS_TOKEN  = '';
let REFRESH_TOKEN = '';
let COOKIE_STRING = '';

/**
 * express router validation
 */
exports.validation = [
	check('query', 'query 가 입력되지 않았습니다.')
		.notEmpty()
]

/**
 * 최근 30일 조회수 연관검색어
 * @param params	쿼리 파라미터
 * @returns {Promise<{code}|{}|boolean|{searchKeywordss: string[], monthlys: {}}>}
 */
exports.get = async (params) => {
	const data = await http.request({
		url    : `https://manage.searchad.naver.com/keywordstool?format=json&hintKeywords=${encodeURI(params.query)}&includeHintKeywords=0&siteId=&biztpId=&month=&event=&showDetail=1&keyword=`,
		options: {
			method : 'GET',
			headers: {
				'authorization': 'Bearer ' + ACCESS_TOKEN,
				'cookie'       : COOKIE_STRING,
			}
		}
	}, {
		apiName: 'NAVER_RELATION',
		isSlack: false  // 푸시알림: true(허용), false(차단)
	}, params)

	// Http 에러발생 시 메시지 return
	if (data.hasOwnProperty('code'))
		return data

	// Undefined, Null 값 체크
	if (_.isUndefined(data) || _.isNull(data))
		return false  // Undefined, Null 있으면 종료

	const searchKeywords = (params['query'] || '').split(',')

	let results = {};
	for (let i = 0; i < searchKeywords.length; i++) {

		const searchKeyword = JSON.parse(data)['keywordList'][i]['relKeyword'];	// 검색 키워드
		const pcCount       = JSON.parse(data)['keywordList'][i]['monthlyPcQcCnt'];	// 월간 조회수
		const pcClick       = JSON.parse(data)['keywordList'][i]['monthlyAvePcClkCnt'];	// 월간 클릭수
		const pcCtr         = JSON.parse(data)['keywordList'][i]['monthlyAvePcCtr'];	// 월간 클릭률
		const mobileCount   = JSON.parse(data)['keywordList'][i]['monthlyMobileQcCnt'];	// 월간 조회수
		const mobileClick   = JSON.parse(data)['keywordList'][i]['monthlyAveMobileClkCnt'];	// 월간 클릭수
		const mobileCtr     = JSON.parse(data)['keywordList'][i]['monthlyAveMobileCtr'];	// 월간 클릭률

		// {[검색키워드], 출력번호 : 검색키워드, {PC}, {MOBILE}}
		results[i + 1] = {
			searchKeyword: searchKeyword === undefined ? null : searchKeyword,
			pcCount      : pcCount === undefined ? null : pcCount,
			pcClick      : pcClick === undefined ? null : pcClick,
			pcCtr        : pcCtr === undefined ? null : pcCtr,
			mobileCount  : mobileCount === undefined ? null : mobileCount,
			mobileClick  : mobileClick === undefined ? null : mobileClick,
			mobileCtr    : mobileCtr === undefined ? null : mobileCtr,
		}
	}

	return {
		searchKeyword: params['query'],
		monthlys     : results
	};
};

/**
 * 세션진행 상태 Return
 * @returns {string}
 */
exports.getStatus = () => {
	return STATUS;
};

/**
 * 세션시작
 * @returns {Promise<void>}
 */
exports.sessionStart = async () => {
	//반복실행 처리
	setInterval(async () => {
		if (STATUS_CONST === true) {
			// 로그인을 시도하여 처음부터 세션값을 얻기위한 시도.
			await loginLoad();
		} else {
			// Refresh Token 생성
			await refreshTokenLoad();
		}
	}, 5 * 60 * 1000);	// 5분

	// 로그인을 시도하여 처음부터 세션값을 얻기위한 시도.
	await loginLoad();
};

/**
 * Naver 검색광고 로그인
 * @returns {Promise<void>}
 */
async function loginLoad() {
	util.logs.info('Naver 검색광고 로그인 시작')

	STATUS = 'PAGE RUN';

	// browser 생성
	BROWSER = await puppeteer.launch({
		headless         : true,
		ignoreHTTPSErrors: true,
		args             : [
			'--no-sandbox',
			'--disable-web-security',
			'--disable-features=IsolateOrigins,site-per-process'
		]
	});

	PAGE = await BROWSER.newPage();
	await PAGE.on('console', msg => util.logs.warn('Naver >> ' + msg.text()));

	// 로그인 페이지 접속
	await PAGE.goto('https://searchad.naver.com/', {
		waitUntil: 'networkidle0',
		timeout  : 5 * 60 * 1000
	});

	// 아이디 입력
	await PAGE.type('input[name="id"]', process.env.NAVER_AD_ID)
	// 비밀번호 입력
	await PAGE.type('input[name="pw"]', process.env.NAVER_AD_PW)
	// Enter Code 입력하여 로그인 시도.
	await PAGE.type('input[name="pw"]', String.fromCharCode(13))

	// 키워드플레너 페이지로 이동
	await PAGE.goto('https://manage.searchad.naver.com/customers/1068705/tool/keyword-planner', {
		waitUntil: 'networkidle0',
		timeout  : 5 * 60 * 1000
	});

	STATUS = 'PAGE STANDBY';

	util.logs.info('Naver 검색광고 로그인 성공')

	if (STATUS_CONST === true) {
		await sessionLoad();		// ACCESS_TOKEN, REFRESH_TOKEN, COOKIE 추출진행
	}
}

/**
 * Naver Keyword Ad Api 세션생성
 * @returns {Promise<boolean>}
 */
async function sessionLoad() {
	util.logs.info('Naver Keyword Ad Api 세션생성 시작')

	STATUS = 'SESSION RUN'

	// accessToken, loginToken 값을 뽑기위한 sessionStorage 조회
	const pageSessions = await PAGE.evaluate(() => {
		let json = {};
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			json[key] = localStorage.getItem(key);
		}
		return json;
	});

	// cookies 값을 뽑기위한 cookies 조회
	const cookies = await PAGE.cookies();
	COOKIE_STRING = '';
	for (const cookie of cookies) {
		COOKIE_STRING += `${cookie.name}=${cookie.value}; `;
	}

	// TOKEN 값이 없다면??
	if (pageSessions === undefined) {
		await BROWSER.close();	// 실패한 가상 브라우저는 닫는다.
		await reLoad('Naver Keyword Ad Api 세션생성 실패');	// 다시시작.
		return false;
	} else {
		ACCESS_TOKEN  = JSON.parse(pageSessions['tokens'])['1068705']['bearer']
		REFRESH_TOKEN = JSON.parse(pageSessions['tokens'])['1068705']['refreshToken']
	}

	// 성공시...
	await BROWSER.close();	// Token 추출 후 가상브라우저는 닫는다.
	STATUS_CONST = false;	// 주기적인 반복 실행 시, Refresh Token 생성 만 추출하기 위한 상태값 변경.

	STATUS = 'SESSION STANDBY';

	util.logs.info('Naver Keyword Ad Api 세션생성 완료')
}

/**
 * Naver Keyword Ad Api Refresh Token 생성
 * @returns {Promise<boolean>}
 */
async function refreshTokenLoad() {
	util.logs.info('Naver Keyword Ad Api Refresh Token 생성 시작')

	STATUS = 'REFRESH TOKEN RUN'

	const data = await token.request({
		url    : `https://atower.searchad.naver.com/auth/local/extend?refreshToken=${REFRESH_TOKEN}`,
		options: {
			method: 'PUT'
		}
	}, {
		apiName: 'NAVER_REFRESH_TOKEN',
		isSlack: false  // 푸시알림: true(허용), false(차단)
	});

	// Object.key 값 문자열 확인
	if (data === undefined) {
		await reLoad('Naver Keyword Ad Api Refresh Token 생성 실패');	// 다시시작.
		return false;
	} else {
		ACCESS_TOKEN  = JSON.parse(data)['token'];
		REFRESH_TOKEN = JSON.parse(data)['refreshToken'];
	}

	STATUS = 'REFRESH TOKEN STANDBY';

	util.logs.info('Naver Keyword Ad Api Refresh Token 생성 완료')
}

/**
 * 각 처리 단계에서 실패가 떨어졌을 경우의 처리
 * @param msg
 * @returns {Promise<void>}
 */
async function reLoad(msg) {
	await util.logs.info(msg)
	await slack.send(msg)		// 세션값이 없으면 slack 으로 알림전송
	await loginLoad()				// 바로 로그인을 시도하여 처음부터 세션값을 얻기위한 시도.
	STATUS_CONST = true			// 주기적인 반복 실행 시, 다시 로그인부터 로드하기 위해 상태값 변경.
}