const router = require('express').Router()

const util = require('../util/common')

const searchView = require('../scraping/naver/view')
const relation   = require('../scraping/naver/relation')
const powerLink  = require('../scraping/naver/powerLink')
const answers    = require('../scraping/naver/answers')
const monthly    = require('../scraping/naver/monthly')
const kin        = require('../scraping/naver/kin')
const news       = require('../scraping/naver/news')
const cafe       = require('../scraping/naver/cafe')
const blog       = require('../scraping/naver/blog')
const webKr      = require('../scraping/naver/webKr')

/**
 * VIEW 영역
 * URI : /api/naver/search/view?query={검색어}&scan={스캔키워드}&start={페이지}&display={노출개수}&sort={정렬옵션}
 */
router.get('/view', searchView.validation, async (req, res) => {
	await util.routers.responseForm(req, res, searchView.get)
})

/**
 * 연관검색어
 * URI : /api/naver/search/relation?query={검색어}&display={노출개수}
 */
router.get('/relation', relation.validation, async (req, res) => {
	await util.routers.responseForm(req, res, relation.get)
})

/**
 * 파워링크
 * URI : /api/naver/search/powerlink?query={검색어}&display={노출개수}
 */
router.get('/powerlink', powerLink.validation, async (req, res) => {
	await util.routers.responseForm(req, res, powerLink.get)
})

/**
 * 지식인 새글 검색영역
 * URI : /api/naver/search/answers?query={검색어}&display={노출개수}
 */
router.get('/answers', answers.validation, async (req, res) => {
	await util.routers.responseForm(req, res, answers.get)
})

/**
 * 지식인 새글 페이지
 * URI : /api/naver/search/answers/page?uri={페이지 URI}
 */
router.get('/answers/page', async (req, res) => {
	await util.routers.responseForm(req, res, answers.getPage)
})

/**
 * 최근 30일 조회수 연관검색어
 * URI : /api/naver/search/monthly?query={검색어}
 */
router.get('/monthly', monthly.validation, async (req, res) => {
	await util.routers.responseForm(req, res, monthly.get)
})

/**
 * 지식인
 * URI : /api/naver/search/kin?query={검색어}&scan={스캔키워드}&start={페이지}&display={노출개수}&sort={정렬옵션}
 */
router.get('/kin', kin.validation, async (req, res) => {
	await util.routers.responseForm(req, res, kin.get)
})

/**
 * 뉴스
 * URI : /api/naver/search/news?query={검색어}&scan={스캔키워드}&start={페이지}&display={노출개수}&sort={정렬옵션}
 */
router.get('/news', news.validation, async (req, res) => {
	await util.routers.responseForm(req, res, news.get)
})

/**
 * 카페
 * URI : /api/naver/search/cafe?query={검색어}&start={페이지}&display={노출개수}&sort={정렬옵션}
 */
router.get('/cafe', cafe.validation, async (req, res) => {
	await util.routers.responseForm(req, res, cafe.get)
})

/**
 * 블로그
 * URI : /api/naver/search/blog?query={검색어}&scan={스캔키워드}&start={페이지}&display={노출개수}&sort={정렬옵션}
 */
router.get('/blog', blog.validation, async (req, res) => {
	await util.routers.responseForm(req, res, blog.get)
})

/**
 * 웹문서
 * URI : /api/naver/search/webkr?query={검색어}&scan={스캔키워드}&start={페이지}&display={노출개수}&sort={정렬옵션}
 */
router.get('/webkr', webKr.validation, async (req, res) => {
	await util.routers.responseForm(req, res, webKr.get)
})

/**
 * 검색광고 세션생성(혹여나 세션생성이 안될 시 임의로 수행할 router)
 * URI : /api/naver/search/session/monthly
 */
router.get('/session/monthly', async (req, res) => {
	await monthly.sessionStart();
})

module.exports = router
