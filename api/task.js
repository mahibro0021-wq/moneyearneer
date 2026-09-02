const { connectToDatabase } = require('./_db');
const { verifyInitData } = require('./_utils');
const { getChatMember } = require('./_telegram');
const { ObjectId } = require('mongodb');

module.exports = async (req, res) => {
  try {
    const db = await connectToDatabase();

    if (req.method === 'GET') {
      const initData = req.query.initData;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      const tasks = await db.collection('tasks').find({ active: true }).sort({ order: 1 }).toArray();
      const submissions = await db.collection('task_submissions').find({ telegramId: tgUser.id }).toArray();
      const doneIds = new Set(submissions.map(s => s.taskId.toString()));

      const result = tasks.map(t => ({
        id: t._id.toString(),
        title: t.title,
        description: t.description,
        link: t.link,
        reward: t.reward,
        type: t.type,
        completed: doneIds.has(t._id.toString())
      }));
      return res.status(200).json({ tasks: result });
    }

    if (req.method === 'POST') {
      const { initData, taskId } = req.body;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      let objId;
      try { objId = new ObjectId(taskId); } catch { return res.status(400).json({ error: 'Invalid task id' }); }

      const task = await db.collection('tasks').findOne({ _id: objId, active: true });
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const already = await db.collection('task_submissions').findOne({ telegramId: tgUser.id, taskId: task._id });
      if (already) return res.status(400).json({ error: 'already_completed' });

      if (task.type === 'verified') {
        const channelRef = task.channelUsername || task.link;
        const joined = await getChatMember(channelRef, tgUser.id);
        if (!joined) {
          return res.status(400).json({ error: 'not_joined' });
        }
      }

      await db.collection('task_submissions').insertOne({
        telegramId: tgUser.id,
        taskId: task._id,
        completedAt: new Date()
      });
      await db.collection('users').updateOne(
        { telegramId: tgUser.id },
        { $inc: { balance: task.reward } }
      );

      return res.status(200).json({ success: true, reward: task.reward });
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
