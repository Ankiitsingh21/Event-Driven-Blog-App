const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(bodyParser.json());
app.use(cors());

const posts = {};

// query/index.js
const handleEvent = (type, data) => {
  if (type === 'PostCreated') {
    const { id, title } = data;
    posts[id] = { id, title, comments: [] };
  }

  if (type === 'CommentCreated') {
    const { id, content, postId, status } = data;
    const post = posts[postId];
    if (!post) return;   // ✅ just return, no res here
    post.comments.push({ id, content, status });
  }

  if (type === 'CommentUpdated') {
    const { id, content, postId, status } = data;
    const post = posts[postId];
    if (!post) return;   // ✅
    const comment = post.comments.find((c) => c.id === id);
    if (!comment) return; // ✅
    comment.status = status;
    comment.content = content;
  }
};

app.get('/posts', (req, res) => {
  // console.log(posts);
  res.send(posts);
});

app.post('/events', (req, res) => {
  console.log("Event Received", req.body.type);
  const { type, data } = req.body;
  handleEvent(type,data);

  res.send({});
});

app.listen(4002, async() => {
  console.log('Listening on 4002');
   try {
    const res = await axios.get("http://event-bus-srv:4005/events");
 
    for (let event of res.data) {
      console.log("Processing event:", event.type);
 
      handleEvent(event.type, event.data);
    }
  } catch (error) {
    console.log(error.message);
  }
});