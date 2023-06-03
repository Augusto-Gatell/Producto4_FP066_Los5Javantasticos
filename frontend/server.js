const express = require('express');
const mongoose = require('mongoose');
//const cors = require('cors');
const { ApolloServer, gql } = require('apollo-server-express');
const multer = require('multer');
const socketio = require('socket.io');

// configuro multer para guardar archivos en la carpeta local
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'files/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

// cargo configuración
const { PORT, GRAPHQL_PATH } = require('./config/config');
const { MONGODB_URI, MONGODB_OPTIONS } = require('./config/database');

// cargo controladores
const weekController = require('./controllers/weekController');
const taskController = require('./controllers/taskController');

// cargo modelos
const Week = require('./models/week');
const Task = require('./models/task');

// creo la app
const app = express();
//app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// conecto a la bd
mongoose.connect(MONGODB_URI, MONGODB_OPTIONS);

// Rutas para Weeks
app.get('/weeks', weekController.getWeeks);
app.post('/weeks', weekController.createWeek);
app.put('/weeks/:id', weekController.updateWeek); 
app.delete('/weeks/:id', weekController.deleteWeek); 

// Rutas para Tasks
app.get('/tasks', taskController.getTasks);
app.post('/tasks', taskController.createTask);
app.put('/tasks/:id', taskController.updateTask); 
app.put('/tasks', taskController.updateTasks); 
app.delete('/tasks/:id', taskController.deleteTask); 
app.post('/tasks/upload', upload.single('file'), (req, res) => {
  // Aquí puedes manejar la lógica de negocio adicional si es necesario
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
    createWeek(year: Int!, numweek: Int!, color: String!, description: String!, priority: Int!, link: String!): Week!
    updateWeek(id: ID!, year: Int!, numweek: Int!, color: String!, description: String!, priority: Int!, link: String!): Week!
    deleteWeek(id: ID!): Week!
    createTask(yearweek: String!, dayofweek: String!, name: String!, description: String!, color: String!, time_start: String!, time_end: String!, finished: Int!, priority: Int!, file: String): Task!
    updateTask(id: ID!, yearweek: String, dayofweek: String, name: String, description: String, color: String, time_start: String, time_end: String, finished: Int, priority: Int, file: String): Task!
    deleteTask(id: ID!): Task!
  }
`;

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
      return newTask;
    },
    updateTask: async (_, { id, ...args }) => {
      const updatedTask = await Task.findByIdAndUpdate(id, args, { new: true });
      return updatedTask;
    },
    deleteTask: async (_, { id }) => {
      const deletedTask = await Task.findByIdAndDelete(id);
      return deletedTask;
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
const { createServer } = require('http');
const { Server } = require('socket.io');

// Añade esta función para iniciar el servidor
async function start() {
  await server.start();
  server.applyMiddleware({ app, path: GRAPHQL_PATH });

  // Crea un servidor HTTP y adjunta la instancia de Express
  const httpServer = createServer(app);

  // Crea una instancia de Socket.IO y adjunta el servidor HTTP
  const io = new Server(httpServer, {
    /*cors: {
      origin: '*', // Ajusta esto según tus necesidades de CORS
    },*/
  });

  // Escucha eventos de conexión de Socket.IO
  io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

  // Aquí puedes manejar eventos de Socket.IO, como emitir y escuchar eventos personalizados

    socket.on('disconnect', () => {
      console.log('Usuario desconectado:', socket.id);
    });
  });

  // Inicia el servidor HTTP en lugar de la instancia de Express
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Llama a la función start
start();