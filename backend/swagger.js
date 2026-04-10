const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' })

const port = process.env.PORT || 4000

const doc = {
  info: {
    title: 'Indium API',
    description: 'Auto-generated OpenAPI document for the Indium backend.',
    version: '1.0.0',
  },
  servers: [
    {
      url: `http://localhost:${port}`,
      description: 'Local server',
    },
  ],
}

const outputFile = './openapi.json'
const endpointsFiles = ['./src/app.ts']

swaggerAutogen(outputFile, endpointsFiles, doc)