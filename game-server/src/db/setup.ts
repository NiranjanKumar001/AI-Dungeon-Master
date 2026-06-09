import 'dotenv/config'
import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  ScalarAttributeType,
  KeyType,
  BillingMode,
  ProjectionType,
} from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
})

const tables = [
  {
    TableName: process.env['DYNAMODB_ROOMS_TABLE'] ?? 'Rooms',
    AttributeDefinitions: [
      { AttributeName: 'roomId', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'roomId', KeyType: KeyType.HASH },
    ],
    BillingMode: BillingMode.PAY_PER_REQUEST,
  },
  {
    TableName: process.env['DYNAMODB_PLAYERS_TABLE'] ?? 'Players',
    AttributeDefinitions: [
      { AttributeName: 'playerId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'roomId',   AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'playerId', KeyType: KeyType.HASH },
      { AttributeName: 'roomId',   KeyType: KeyType.RANGE },
    ],
    BillingMode: BillingMode.PAY_PER_REQUEST,
    GlobalSecondaryIndexes: [
      {
        IndexName: 'roomId-index',
        KeySchema: [{ AttributeName: 'roomId', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ],
  },
  {
    TableName: process.env['DYNAMODB_GAMELOG_TABLE'] ?? 'GameLog',
    AttributeDefinitions: [
      { AttributeName: 'roomId',    AttributeType: ScalarAttributeType.S },
      { AttributeName: 'timestamp', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'roomId',    KeyType: KeyType.HASH },
      { AttributeName: 'timestamp', KeyType: KeyType.RANGE },
    ],
    BillingMode: BillingMode.PAY_PER_REQUEST,
  },
  {
    TableName: process.env['DYNAMODB_ENEMIES_TABLE'] ?? 'EnemyState',
    AttributeDefinitions: [
      { AttributeName: 'roomId',  AttributeType: ScalarAttributeType.S },
      { AttributeName: 'enemyId', AttributeType: ScalarAttributeType.S },
    ],
    KeySchema: [
      { AttributeName: 'roomId',  KeyType: KeyType.HASH },
      { AttributeName: 'enemyId', KeyType: KeyType.RANGE },
    ],
    BillingMode: BillingMode.PAY_PER_REQUEST,
  },
]

async function setup() {
  const existing = await client.send(new ListTablesCommand({}))
  const existingNames = existing.TableNames ?? []

  for (const table of tables) {
    if (existingNames.includes(table.TableName)) {
      console.log(`[skip] ${table.TableName} already exists`)
      continue
    }
    await client.send(new CreateTableCommand(table))
    console.log(`[ok]   ${table.TableName} created`)
  }

  console.log('\nAll tables ready.')
}

setup().catch(err => {
  console.error('Setup failed:', (err as Error).message)
  process.exit(1)
})
