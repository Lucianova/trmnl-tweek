import { responseError } from '../src/utils.js'

test('polled response with a task list', () => {
  expect(responseError({ data: [], nextDocId: null })).toBeNull()
})

test.each([
  [{ message: 'Calendar not found', error: 'Not Found', statusCode: 404 }, 'Calendar not found — check your Calendar ID in the plugin settings.'],
  [{ message: 'Invalid API key', error: 'Unauthorized', statusCode: 401 }, 'Check your Tweek API key in the plugin settings.'],
  [{ message: 'Forbidden', error: 'Forbidden', statusCode: 403 }, 'Check your Tweek API key in the plugin settings.'],
  [{ message: 'Too Many Requests', statusCode: 429 }, "Tweek's API limit is used up for this month."],
  [{ message: 'Internal server error', statusCode: 500 }, "Couldn't reach Tweek. It will retry on the next refresh."],
])('Tweek error body with status %#', (body, expected) => {
  expect(responseError(body)).toBe(expected)
})

test.each([
  ['empty body from a failed poll', {}],
  ['data that is not a list', { data: 'oops' }],
  ['no response at all', undefined],
])('%s', (_, body) => {
  expect(responseError(body)).toBe("Couldn't reach Tweek. It will retry on the next refresh.")
})
