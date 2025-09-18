import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';   
import { BrowserRouter } from 'react-router-dom';                 // your app css
import 'bootstrap/dist/css/bootstrap.min.css'; // <- add this
import App from './App';
import './index.css';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
