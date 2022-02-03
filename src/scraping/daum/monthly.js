require('dotenv').config()  // .env 환경설정

const _             = require('lodash')
const {check}       = require('express-validator')
const puppeteer     = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const slack = require('../../util/slack')
const util  = require('../../util/common')
const http  = require('../../scraping/httpRequest')

let PAGE          = null;
let BROWSER       = null;
let STATUS        = 'INITIALIZING';
let STATUS_CONST  = true;	// 각 Load 처리에 대한 상태 값(상태 따라 반복실행의 분기처리 용도)
let ACCESS_TOKEN  = '';
let LOGIN_TOKEN   = '';
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
 * @returns {Promise<{code}|{}|boolean|{pc: {ctr: (null|*), count: (null|*), click: (null|*)}, mobile: {ctr: (null|*), count: (null|*), click: (null|*)}, searchKeyword}>}
 */
exports.get = async (params) => {
	const data = await http.request({
		url    : `https://api.keywordad.kakao.com/api/v1/recommend-keywords?q=${encodeURI(params.query)}`,
		options: {
			method : 'GET',
			headers: {
				'accesstoken': ACCESS_TOKEN,
				'logintoken' : LOGIN_TOKEN,
				'cookie'     : COOKIE_STRING,
			}
		}
	}, {
		apiName: 'DAUM_RELATION',
		isSlack: false  // 푸시알림: true(허용), false(차단)
	}, params)

	// Http 에러발생 시 메시지 return
	if (data.hasOwnProperty('code'))
		return data

	// Undefined, Null 값 체크
	if (_.isUndefined(data) || _.isNull(data))
		return false  // Undefined, Null 있으면 종료

	const pcCount     = JSON.parse(data)['data'][0]['stats'][1]['bidRequest'];	// 월간 pc 조회수
	const pcClick     = JSON.parse(data)['data'][0]['stats'][1]['click'];	// 월간 pc 클릭수
	const pcCtr       = JSON.parse(data)['data'][0]['stats'][1]['ctr'];	// 월간 pc 클릭률
	const mobileCount = JSON.parse(data)['data'][0]['stats'][0]['bidRequest'];	// 월간 mobile 조회수
	const mobileClick = JSON.parse(data)['data'][0]['stats'][0]['click'];	// 월간 mobile 클릭수
	const mobileCtr   = JSON.parse(data)['data'][0]['stats'][0]['ctr'];	// 월간 mobile 클릭률

	// {검색키워드, {PC}, {MOBILE}}
	return {
		searchKeyword: params['query'],
		monthlys     : {
			pcCount    : pcCount === undefined ? null : pcCount,
			pcClick    : pcClick === undefined ? null : pcClick,
			pcCtr      : pcCtr === undefined ? null : pcCtr,
			mobileCount: mobileCount === undefined ? null : mobileCount,
			mobileClick: mobileClick === undefined ? null : mobileClick,
			mobileCtr  : mobileCtr === undefined ? null : mobileCtr
		}
	}
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
	// 반복실행 처리
	setInterval(async () => {
		if (STATUS_CONST === true) {
			// 로그인을 시도하여 처음부터 세션값을 얻기위한 시도.
			await loginLoad();
		} else {
			// 페이지 세션정보 불러오기
			await sessionLoad();
		}
	}, 20 * 60 * 1000);	// 20분

	// 로그인을 시도하여 처음부터 세션값을 얻기위한 시도.
	await loginLoad();
};

/**
 * Kakao Business 로그인
 * @returns {Promise<void>}
 */
async function loginLoad() {
	util.logs.info('Kakao Business 로그인 시작')

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
	await PAGE.on('console', msg => util.logs.warn('Kakao >> ' + msg.text()));

	// 로그인 페이지 접속
	await PAGE.goto('https://keywordad.kakao.com/344192/keyword-planner', {
		waitUntil: 'networkidle0',
		timeout  : 5 * 60 * 1000
	});

	// 아이디 입력
	await PAGE.type('input[name="email"]', process.env.KAKAO_AD_ID)
	// 비밀번호 입력
	await PAGE.type('input[name="password"]', process.env.KAKAO_AD_PW)
	// Enter Code 입력하여 로그인 시도.
	await PAGE.type('input[name="password"]', String.fromCharCode(13))

	// 중간에 딜레이를 줘야 sessionStorage 값이 받아짐.ㅡ_ㅡ
	// PAGE.goto 에서 networkidle0 을 설정한다 해도 완벽하게 로드되지 않는다.
	await util.delay.sleep(5000);

	STATUS = 'PAGE STANDBY';

	util.logs.info('Kakao Business 로그인 성공')

	if (STATUS_CONST === true) {
		await sessionLoad();	// ACCESS_TOKEN, LOGIN_TOKEN, COOKIE 추출
	}
}

/**
 * Kakao Keyword Ad Api 세션생성
 * @returns {Promise<boolean>}
 */
async function sessionLoad() {
	util.logs.info('kakao Keyword Ad Api 세션생성 시작')

	STATUS = 'SESSION RUN'

	// Google Recaptcha 때문에 페이지를 새로고침만 진행.
	// 갱신된 세션값만 불러오는 용도로 사용되며,
	// 성공 시 별도로 BROWSER.close() 는 하지 않는다.
	await PAGE.reload();

	// accessToken, loginToken 값을 뽑기위한 sessionStorage 조회
	const pageSessions = await PAGE.evaluate(() => {
		let json = {};
		for (let i = 0; i < sessionStorage.length; i++) {
			const key = sessionStorage.key(i);
			json[key] = sessionStorage.getItem(key);
		}
		return json;
	});

	// 쿠키값을 뽑기위한 쿠키값 조회.
	const cookies = await PAGE.cookies();
	COOKIE_STRING = '';
	for (const cookie of cookies) {
		COOKIE_STRING += `${cookie.name}=${cookie.value}; `;
	}

	// TOKEN 값이 없다면??
	if (pageSessions === undefined) {
		await BROWSER.close();	// 실패한 가상 브라우저는 닫는다.
		await reLoad('Kakao Keyword Ad Api 세션생성 실패');	// 다시시작.
		return false;
	} else {
		ACCESS_TOKEN = pageSessions['accessToken'];
		LOGIN_TOKEN  = pageSessions['loginToken'];
	}

	// 성공시...
	STATUS_CONST = false;		// 주기적인 반복 실행 시, 새로고침 만 으로 session 값 추출하기 위한 상태값 변경.

	STATUS = 'STANDBY';

	util.logs.info("Kakao Keyword Ad Api 세션생성 완료")
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