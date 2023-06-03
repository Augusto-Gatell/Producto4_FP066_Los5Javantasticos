const { ApolloServer, gql } = require("apollo-server-express");
const { PubSub } = require("graphql-subscriptions");
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { WebSocketServer } = require("ws");
const { useServer } = require('graphql-ws/lib/use/ws');
const { ApolloServerPluginDrainHttpServer } = require('apollo-server-core');

// cargo configuración
const { PORT, GRAPHQL_PATH } = require("./config/config");
const { MONGODB_URI, MONGODB_OPTIONS } = require("./config/database");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const http = require('http')
const pubsub = new PubSub();

// configuro multer para guardar archivos en la carpeta local
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "dist/files/");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

// cargo controladores
const weekController = require("./controllers/weekController");
const taskController = require("./controllers/taskController");

// cargo modelos
const Week = require("./models/week");
const Task = require("./models/task");

// creo la app
const app = express();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "interfaz1.html"));
});
app.use(express.static(path.join(__dirname, "dist")));

app.use(cors());
app.use(express.json());

// conecto a la bd
mongoose.connect(MONGODB_URI, MONGODB_OPTIONS);

// Rutas para Weeks
app.get("/weeks", weekController.getWeeks);
app.post("/weeks", weekController.createWeek);
app.put("/weeks/:id", weekController.updateWeek);
app.delete("/weeks/:id", weekController.deleteWeek);

// Rutas para Tasks
app.get("/tasks", taskController.getTasks);
app.post("/tasks", taskController.createTask);
app.put("/tasks/:id", taskController.updateTask);
app.put("/tasks", taskController.updateTasks);
app.delete("/tasks/:id", taskController.deleteTask);
app.post("/tasks/upload", upload.single("file"), (req, res) => {
  res.send('Archivo subido y guardado en la carpeta "files".');
});

// Definición de tipos y esquemas GraphQL
const typeDefs = gql`
  type Week {
    id: ID!
    year: Int!
    numweek: Int!
    color: String!
    description: String!
    priority: Int!
    link: String!
  }

  type Task {
    id: ID!
    yearweek: String!
    dayofweek: String!
    name: String!
    description: String!
    color: String!
    time_start: String!
    time_end: String!
    finished: Int!
    priority: Int!
    file: String
  }

  type Query {
    weeks: [Week!]!
    tasks: [Task!]!
  }

  type Mutation {
    createWeek(
      year: Int!
      numweek: Int!
      color: String!
      description: String!
      priority: Int!
      link: String!
    ): Week!
    updateWeek(
      id: ID!
      year: Int!
      numweek: Int!
      color: String!
      description: String!
      priority: Int!
      link: String!
    ): Week!
    deleteWeek(id: ID!): Week!
    createTask(
      yearweek: String!
      dayofweek: String!
      name: String!
      description: String!
      color: String!
      time_start: String!
      time_end: String!
      finished: Int!
      priority: Int!
      file: String
    ): Task!
    updateTask(
      id: ID!
      yearweek: String
      dayofweek: String
      name: String
      description: String
      color: String
      time_start: String
      time_end: String
      finished: Int
      priority: Int
      file: String
    ): Task!
    deleteTask(id: ID!): Task!
  }

  type Subscription {
    taskAdded: Task
    taskUpdated: Task
    taskDeleted: Task
  }

`;

const TASK_ADDED = "TASK_ADDED";
const TASK_UPDATED = "TASK_UPDATED";
const TASK_DELETED = "TASK_DELETED";

// Resolvers GraphQL
const resolvers = {
  Query: {
    weeks: async () => await Week.find(),
    tasks: async () => await Task.find(),
  },
  Mutation: {
    createWeek: async (_, args) => {
      const newWeek = new Week(args);
      await newWeek.save();
      return newWeek;
    },
    updateWeek: async (_, { id, ...args }) => {
      const updatedWeek = await Week.findByIdAndUpdate(id, args, { new: true });
      return updatedWeek;
    },
    deleteWeek: async (_, { id }) => {
      const deletedWeek = await Week.findByIdAndDelete(id);
      return deletedWeek;
    },
    createTask: async (_, args) => {
      const newTask = new Task(args);
      await newTask.save();
      pubsub.publish(TASK_ADDED, { taskAdded: newTask });
      return newTask;
    },
    updateTask: async (_, { id, ...args }) => {
      const updatedTask = await Task.findByIdAndUpdate(id, args, { new: true });
      pubsub.publish(TASK_UPDATED, { taskUpdated: updatedTask });
      return updatedTask;
    },
    deleteTask: async (_, { id }) => {
      const deletedTask = await Task.findByIdAndDelete(id);
      pubsub.publish(TASK_DELETED, { taskDeleted: deletedTask });
      return deletedTask;
    },

  },

  Subscription: {
    taskAdded: {
      subscribe: () => pubsub.asyncIterator([TASK_ADDED]),
    },
    taskUpdated: {
      subscribe: () => pubsub.asyncIterator([TASK_UPDATED]),
    },
    taskDeleted: {
      subscribe: () => pubsub.asyncIterator([TASK_DELETED]),
    },
  },
};
  
const schema = makeExecutableSchema({ typeDefs, resolvers });


// Añade esta función para iniciar el servidor
async function start() {
  
  const httpServer = http.createServer(app)
  
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });
  const serverCleanup = useServer({ schema }, wsServer);

  // Set up ApolloServer.
  const server = new ApolloServer({
    schema,
    plugins: [
      // Proper shutdown for the HTTP server.
      ApolloServerPluginDrainHttpServer({ httpServer }),

      // Proper shutdown for the WebSocket server.
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });
  await server.start();
  server.applyMiddleware({ app });

  // Now that our HTTP server is fully set up, actually listen.
  httpServer.listen(PORT, () => {
    console.log(
      `🚀 Query endpoint ready at http://localhost:${PORT}${server.graphqlPath}`
    );
    console.log(
      `🚀 Subscription endpoint ready at ws://localhost:${PORT}${server.graphqlPath}`
    );
  });
}

// Llama a la función start
start();
