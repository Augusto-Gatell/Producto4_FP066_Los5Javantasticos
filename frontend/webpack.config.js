const path = require('path');

module.exports = {
  entry: './js/tasks.js',  // Asume que tu archivo de entrada está en 'src/tasks.js'
  output: {
    filename: 'main.js',  // Esto producirá un archivo 'main.js' en la carpeta 'dist'
    path: path.resolve(__dirname, 'dist'),
  },
};
