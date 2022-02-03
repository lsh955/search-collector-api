const router = require('express').Router()

const util = require('../util/common')

const cafe     = require('../scraping/daum/cafe')
const blog     = require('../scraping/daum/blog')
const web      = require('../scraping/daum/web')
const relation = require('../scraping/daum/relation')
const monthly  = require('../scraping/daum/monthly')

/**
 * 카페 검색영역
 * URI : /api/daum/search/cafe?query={검색어}&page={시작위치}&size={노출개수}&sort={정렬옵션}
 */
router.get('/cafe', cafe.validation, async (req, res) => {
	await util.routers.responseForm(req, res, cafe.get)
})

/**
 * 블로그 검색영역
 * URI : /api/daum/search/blog?query={검색어}&scan={스캔키워드}&page={시작위치}&size={노출개수}&sort={정렬옵션}
 */
router.get('/blog', blog.validation, async (req, res) => {
	await util.routers.responseForm(req, res, blog.get)
})

/**
 * 웹문서 검색영역
 * URI : /api/daum/search/web?query={검색어}&scan={스캔키워드}&page={시작위치}&size={노출개수}&sort={정렬옵션}
 */
router.get('/web', web.validation, async (req, res) => {
	await util.routers.responseForm(req, res, web.get)
})

/**
 * 키워드 연관검색어
 * URI : /api/daum/search/relation?query={검색어}&size={노출개수}
 */
router.get('/relation', relation.validation, async (req, res) => {
	await util.routers.responseForm(req, res, relation.get)
})

/**
 * 최근 30일 조회수 연관검색어
 * URI : /api/daum/search/monthly?query={검색어}
 */
router.get('/monthly', monthly.validation, async (req, res) => {
	await util.routers.responseForm(req, res, monthly.get)
})

/**
 * Kakao Business 세션생성(혹여나 세션생성이 안될 시 임의로 수행할 router)
 * URI : /api/daum/search/session/monthly
 */
router.get('/session/monthly', async (req, res) => {
	await monthly.sessionStart();
})

module.exports = router