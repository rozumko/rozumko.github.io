import { expect, test, type BrowserContext, type Route } from '@playwright/test'

const sessionId = '00000000-0000-4000-8000-000000000101'
const participantId = '00000000-0000-4000-8000-000000000102'
const questionId = '00000000-0000-4000-8000-000000000103'
const joinCode = '654321'

interface PilotState {
  /** The teacher has created a session, so the dashboard can find it again. */
  created: boolean
  status: 'lobby' | 'active' | 'finished'
  participantJoined: boolean
  answered: boolean
  score: number
}

const question = {
  id: questionId,
  q: 'Скільки кроків у послідовності: старт → дія → фініш?',
  type: 'choice',
  options: ['3', '2', '4', '1'],
  topic: 'algorithms',
  difficulty: 'easy',
  img: null,
  imageAlt: null,
  code: null,
}

function session(state: PilotState) {
  return {
    id: sessionId,
    joinCode,
    grade: 2,
    difficulty: 'easy',
    questionsCount: 1,
    status: state.status,
    kind: 'questions',
    activityKey: null,
    activityLevel: null,
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function installPilotApi(context: BrowserContext, state: PilotState) {
  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === '/api/teacher/me') {
      await json(route, { id: 'teacher-1', authUserId: 'auth-teacher-1', role: 'teacher', name: 'Pilot Teacher' })
      return
    }
    if (path === '/api/teacher/registration-events') { await json(route, { events: [] }); return }
    if (path === '/api/teacher/classes') { await json(route, { classes: [] }); return }
    if (path === '/api/teacher/registrations') { await json(route, { registrations: [] }); return }
    if (path === '/api/teacher/codes') { await json(route, { codes: [] }); return }
    if (path === '/api/teacher/results') { await json(route, { results: [] }); return }
    if (path === '/api/school/question-availability') {
      const count = { total: 8, byDifficulty: { easy: 8, medium: 0, hard: 0 } }
      await json(route, {
        mixed: count,
        topics: [
          'information-messages',
          'computer-devices',
          'digital-tools',
          'data-tables-charts',
          'algorithms-programming',
          'internet-networks-search',
          'digital-safety',
        ].map(id => ({ id, ...count })),
      })
      return
    }
    if (path === '/api/school/sessions' && method === 'POST') {
      state.created = true
      await json(route, { session: session(state) }, 201)
      return
    }
    if (path === '/api/school/sessions' && method === 'GET') {
      if (!state.created) { await json(route, { sessions: [] }); return }
      await json(route, {
        sessions: [{
          ...session(state),
          createdAt: new Date().toISOString(),
          finishedAt: state.status === 'finished' ? new Date().toISOString() : null,
          participantCount: state.participantJoined ? 1 : 0,
          live: state.status !== 'finished',
        }],
      })
      return
    }
    if (path === `/api/school/sessions/${sessionId}/preview`) {
      await json(route, { questions: [{ ...question, position: 0, correctOption: 0, answerText: '3', explanation: null }] })
      return
    }
    if (path === `/api/school/sessions/${sessionId}/start` && method === 'POST') {
      state.status = 'active'
      await json(route, { status: state.status })
      return
    }
    if (path === `/api/school/sessions/${sessionId}/finish` && method === 'POST') {
      state.status = 'finished'
      await json(route, { status: state.status })
      return
    }
    if (path === `/api/school/sessions/${sessionId}` && method === 'GET') {
      const participants = state.participantJoined
        ? [{ id: participantId, avatar: 'fox', nickname: 'Лисеня', score: state.score, answeredCount: state.answered ? 1 : 0 }]
        : []
      await json(route, {
        session: session(state),
        participants,
        topicStats: state.answered ? [{ topic: 'algorithms', total: 1, correct: 1 }] : [],
        activityResults: [],
      })
      return
    }
    if (path === '/api/school/join' && method === 'POST') {
      state.participantJoined = true
      await json(route, {
        participantId,
        participantToken: 'pilot-participant-token',
        status: state.status,
        grade: 2,
        kind: 'questions',
        activityKey: null,
        activityLevel: null,
        questions: state.status === 'active' ? [question] : [],
        questionsCount: state.status === 'active' ? 1 : 0,
      }, 201)
      return
    }
    if (path === `/api/school/participants/${participantId}/session` && method === 'GET') {
      await json(route, {
        status: state.status,
        grade: 2,
        kind: 'questions',
        activityKey: null,
        activityLevel: null,
        questions: state.status === 'active' ? [question] : [],
        questionsCount: state.status === 'active' ? 1 : 0,
        score: state.score,
        answeredQuestionIds: state.answered ? [questionId] : [],
        activityDone: false,
      })
      return
    }
    if (path === `/api/school/participants/${participantId}/answer` && method === 'POST') {
      if (state.status !== 'active') { await json(route, { error: 'Сесія неактивна' }, 409); return }
      state.answered = true
      state.score = 1
      await json(route, { correct: true })
      return
    }
    if (path === `/api/school/participants/${participantId}/avatar` && method === 'PATCH') {
      await json(route, { ok: true })
      return
    }

    await json(route, {})
  })
}

test('pilot happy path: teacher starts a code game, child completes it, class summary updates', async ({ context }) => {
  const state: PilotState = { created: false, status: 'lobby', participantJoined: false, answered: false, score: 0 }
  await installPilotApi(context, state)

  const teacher = await context.newPage()
  await teacher.addInitScript(() => {
    sessionStorage.setItem('teacher_session', JSON.stringify({
      accessToken: 'teacher-pilot-token',
      refreshToken: '',
      email: 'teacher@example.test',
    }))
  })
  await teacher.goto('/teacher.html')
  await expect(teacher.locator('#dashboard-section')).toBeVisible()
  await expect(teacher.locator('#teacher-section-school')).toBeVisible()

  await teacher.locator('#school-create-btn').click()
  await expect(teacher.locator('#school-preview')).toBeVisible()
  await teacher.locator('#school-preview-start-btn').click()
  await expect(teacher.locator('#school-live')).toBeVisible()
  await expect(teacher.locator('#school-join-code')).toHaveText(joinCode)

  const child = await context.newPage()
  await child.goto(`/school.html?code=${joinCode}`)
  await expect(child.locator('#join-code')).toHaveValue(joinCode)
  await child.locator('#join-nickname').fill('Лисеня')
  await child.locator('#join-btn').click()
  await expect(child.locator('#mission-waiting')).toBeVisible()

  await expect(teacher.locator('#school-participant-count')).toHaveText('1', { timeout: 7_000 })
  await teacher.locator('#school-start-btn').click()
  await expect(child.locator('#mission-quiz')).toBeVisible({ timeout: 5_000 })

  await child.getByRole('radio', { name: '3' }).click()
  await child.locator('#quiz-next-btn').click()
  await expect(child.locator('#mission-result')).toBeVisible()
  await expect(child.locator('#mission-retry-btn')).toHaveText('Ввести інший код')

  await expect(teacher.locator('#school-class-summary')).toContainText('1 / 1', { timeout: 7_000 })
  await expect(teacher.locator('#school-class-summary')).toContainText('100%')

  // A reloaded projector laptop must land back on the running game, not on an
  // empty setup screen with the class still playing.
  await teacher.reload()
  await expect(teacher.locator('#school-live')).toBeVisible()
  await expect(teacher.locator('#school-join-code')).toHaveText(joinCode)
  await expect(teacher.locator('#school-class-summary')).toContainText('1 / 1', { timeout: 7_000 })

  await teacher.locator('#school-finish-btn').click()
  await expect(teacher.locator('#school-status')).toContainText('Завершено')
  await expect(teacher.locator('#school-new-btn')).toBeVisible()
  // The dead code and share link go away once the game is over.
  await expect(teacher.locator('#school-join-access')).toBeHidden()
  await expect(teacher.locator('#school-join-share')).toBeHidden()

  // The finished game stays reachable as history.
  await teacher.locator('#school-new-btn').click()
  await expect(teacher.locator('#school-history')).toBeVisible()
  await teacher.locator('.school-history__open').click()
  await expect(teacher.locator('#school-live')).toBeVisible()
  await expect(teacher.locator('#school-class-summary')).toContainText('1 / 1', { timeout: 7_000 })
})
