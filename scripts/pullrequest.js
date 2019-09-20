const { exec } = require('child_process')
const fetch = require('node-fetch')
const {
  GH_TRAVIS_PR_COMMENTS,
  BUILD_DIR,
  SFTP_USER,
  SFTP_PASSWORD,
  SFTP_SITE_URL,
  SFTP_SITE_IP,
  TARGET_DIR,
  TRAVIS_PULL_REQUEST,
  TRAVIS_PULL_REQUEST_BRANCH,
  TRAVIS_PULL_REQUEST_SHA,
  TRAVIS_BUILD_WEB_URL,
  TRAVIS_REPO_SLUG,
} = process.env

const targetdir = `${TARGET_DIR.split('/')
  .slice(0, TARGET_DIR.split('/').length - 1)
  .join('/')}/${process.env.BUILD_NAME ||
  TRAVIS_REPO_SLUG.split('/')
    .slice(1)
    .toString()}-${TRAVIS_PULL_REQUEST_BRANCH}`

exec(
  `sshpass -p "${SFTP_PASSWORD}" rsync -avz --chmod=775 ${
    BUILD_DIR.endsWith('/') ? BUILD_DIR : `${BUILD_DIR}/`
  } ${SFTP_USER}@${SFTP_SITE_IP}:${targetdir}`
)

const getCommentsToDelete = async () => {
  console.log('Fetching comments...')
  const res = await fetch(
    `https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/${TRAVIS_PULL_REQUEST}/comments`,
    {
      headers: {
        Authorization: `token ${GH_TRAVIS_PR_COMMENTS}`,
        'Content-Type': 'application/json',
      },
    }
  )
  const data = await res.json()
  const userRes = await fetch(`https://api.github.com/user`, {
    headers: {
      Authorization: `token ${GH_TRAVIS_PR_COMMENTS}`,
      'Content-Type': 'application/json',
    },
  })
  const user = await userRes.json()
  data.filter(d => d.user.login === user.login && d.body.startsWith('## [TRAVIS]'))
  console.log(`${data.length} comments to be deleted`)
  return [...data.map(d => d.id)]
}

const deleteComments = async comments => {
  console.log('Deleting comments...')
  await comments.forEach(async commentId => {
    const res = await fetch(
      `https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/comments/${commentId}`,
      {
        method: 'delete',
        headers: { Authorization: `token ${GH_TRAVIS_PR_COMMENTS}` },
      }
    )
    if (res.status === 204) {
      console.info(`deleted comment ${commentId}`)
    }
  })
}

const sendComment = async () => {
  console.log(`Notifying users via Github`)
  const buildNum = TRAVIS_BUILD_WEB_URL.split('/')[TRAVIS_BUILD_WEB_URL.split('/').length - 1]
  const buildUrl = `https://travis.app.com/${TRAVIS_REPO_SLUG}/builds/${buildNum}`
  const deployUrlHandle = targetdir
    .split('/')
    .slice(targetdir.split('/').indexOf('gbslearn') + 1)
    .join('/')
  const deployUrl = `https://${SFTP_SITE_URL}/${deployUrlHandle}`
  const comment = `## [TRAVIS] - ${TRAVIS_PULL_REQUEST_SHA} \n\nBuild complete! Preview available at ${deployUrl}\n\n---\n[Read full build log](${buildUrl})`
  const res = await fetch(
    `https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/${TRAVIS_PULL_REQUEST}/comments`,
    {
      method: 'post',
      body: JSON.stringify({ body: comment }),
      headers: {
        Authorization: `token ${GH_TRAVIS_PR_COMMENTS}`,
        'Content-Type': 'application/json',
      },
    }
  )
  const data = await res.json()
  if (data.id) {
    console.info('Successfully notified!')
  }
}

getCommentsToDelete()
  .then(deleteComments)
  .then(() => sendComment())
  .then(() => console.log('Script completed'))
  .catch(console.error)
