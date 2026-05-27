import { rest } from 'msw'

export const visionHandlers = [
  rest.post('https://vision.googleapis.com/v1/images:annotate', (req, res, ctx) => {
    return res(ctx.json({
      responses: [{
        labelAnnotations: [
          { description: 'tomato', score: 0.95, topicality: 0.95 },
          { description: 'vegetable', score: 0.88, topicality: 0.88 },
          { description: 'red', score: 0.72, topicality: 0.72 },
        ],
        safeSearchAnnotation: {
          adult: 'VERY_UNLIKELY',
          violence: 'VERY_UNLIKELY',
          racy: 'VERY_UNLIKELY',
        },
      }],
    }))
  }),
]
