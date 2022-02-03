require('dotenv').config()  // .env 환경설정

const Slack = require('slack-node')

slack = new Slack()
slack.setWebhook(process.env.SLACK_WEB_HOOK_URL) // Webhook URL
const send = async (message) => {
	slack.webhook({
		channel    : '#scraping',
		username   : 'scraping',
		icon_emoji : ':ghost:',
		attachments: [
			{
				'color' : '#2eb886',
				'fields': [
					{
						'title': `${process.env.SERVER_NAME} 알림`,
						'value': message,
						'short': false
					}
				]
			}
		]
	}, function (err, response) {
		if (err !== null) {
			console.log('Slack ERROR:: ' + err)
		}
	})
}

exports.send = send