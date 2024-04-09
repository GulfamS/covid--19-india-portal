const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
const app = express()
app.use(express.json())

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is Running at localhost://3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const convertStateObjToResponseObj = dbObj => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  }
}

const convertDistrictObjToResponseObj = dbObj => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  }
}

function authenticateToken(request, response, next) {
  let jwtToken
  const authenHeader = request.headers['authorization']
  if (authenHeader !== undefined) {
    jwtToken = authenHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        console.log(payload)
        next()
      }
    })
  }
}

//API 1 login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
        SELECT * 
        FROM user
        WHERE username = '${username}';
    `
  const dbUser = await db.get(selectUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPassMatch = await bcrypt.compare(password, dbUser.password)

    if (isPassMatch === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Returns list of all stated in state table API 2
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
        SELECT * 
        FROM state;
    `
  const stateList = await db.all(getStatesQuery)
  response.send(
    stateList.map(eachState => convertStateObjToResponseObj(eachState)),
  )
})

//Returns state bases on state_id API 3
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
        SELECT * 
        FROM state
        WHERE state_id = ${stateId};
    `
  const getState = await db.get(getStateQuery)
  response.send(convertStateObjToResponseObj(getState))
})

//create district in disctrict table API 4
app.post('/districts/', authenticateToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
        INSERT INTO 
          district (state_id, district_name, cases, cured, active, deaths)
        VALUES
          (${stateId}, '${districtName}', ${cases}, ${cured}, ${active}, ${deaths});
    `
  await db.run(postDistrictQuery)
  response.send('District Successfully Added')
})

//Returns district based on district_id API 5
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
        SELECT * 
        FROM district 
        WHERE district_id = ${districtId};
    `
    const district = await db.get(getDistrictQuery)
    response.send(convertDistrictObjToResponseObj(district))
  },
)

//API 6 delete district from table
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteQuery = `
        DELETE FROM 
          district
        WHERE district_id = ${districtId};
    `
    await db.run(deleteQuery)
    response.send('District Removed')
  },
)

//API 7 update details of specific district
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const updateQuery = `
        UPDATE district
        SET 
          district_name = ${districtName},
          state_id = ${stateId},
          cases = ${cases},
          cured = ${cured}, 
          active = ${active},
          deaths = ${deaths}
        WHERE district_id = ${districtId};
    `
    await db.run(updateQuery)
    response.send('District Details Updated')
  },
)

//API 8 Returns the statistics of total
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getTotalStatQuery = `
        SELECT 
          SUM(cases),
          SUM(cured),
          SUM(active),
          SUM(deaths)
        FROM district
        WHERE state_id = ${stateId};
    `
    const stats = await db.get(getTotalStatQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

module.exports = app
