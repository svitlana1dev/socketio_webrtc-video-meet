const express = require("express");
const path = require("path");
const app = express();
const server = app.listen(3000, () => {
  console.log("Listening on port 3000");
});
const fs = require("fs");
const fileUpload = require("express-fileupload");
const io = require("socket.io")(server, {
  allowEIO3: true,
});
app.use(express.static(path.join(__dirname, "")));
const userConnections = [];
const hostInfo = [];
io.on("connection", (socket) => {
  console.log("socket id is ", socket.id);

  const userConnect = async (data) => {
    console.log("from UserConnect");
    console.log("userconnent displayName", data.displayNames);
    console.log("userconnent meetingid", data.meetingids);
    console.log("userconnent connectionId", data.connectionIds);

    const existingUser = userConnections.find(
      (p) =>
        p.meeting_id === data.meetingids &&
        p.connectionId === data.connectionIds
    );

    if (!existingUser) {
      userConnections.push({
        connectionId: data.connectionIds,
        user_id: data.displayNames,
        meeting_id: data.meetingids,
      });

      const other_users = userConnections.filter(
        (p) =>
          p.meeting_id == data.meetingids &&
          p.connectionId !== data.connectionIds
      );

      const userCount = userConnections.length;
      console.log(userCount);

      console.log("other_users length before forEach:", other_users.length);

      socket
        .to(data.connectionIds)
        .emit("inform_me_about_other_user", other_users);

      other_users.forEach((v) => {
        console.log("Inside forEach");
        console.log("data:", data);
        console.log("v:", v);
        try {
          io.to(v.connectionId).emit("inform_others_about_me", {
            other_user_id: data.displayNames,
            connId: data.connectionIds,
            userNumber: userCount,
          });
        } catch (error) {
          console.error("Error in emit:", error);
        }
      });
    }
  };

  socket.on("askToConnect", (data) => {
    const isMeetingExist = userConnections.find(
      (info) => info.meeting_id === data.meetingid
    );
    if (isMeetingExist) {
      const isHostForMeeting = hostInfo.find(
        (info) => info.meeting_id === data.meetingid
      );
      socket.to(isHostForMeeting.connectionId).emit("request_join_permission", {
        displayNames: data.displayName,
        meetingids: data.meetingid,
        connectionIds: socket.id,
      });
    } else {
      hostInfo.push({
        connectionId: socket.id,
        user_id: data.displayName,
        meeting_id: data.meetingid,
        host: true,
      });
      const datt = {
        displayNames: data.displayName,
        meetingids: data.meetingid,
        connectionIds: socket.id,
        host: true,
      };
      try {
        userConnect(datt);
      } catch (error) {
        console.log("error is ", error);
      }
    }
  });

  socket.on("grant_join_permission", (dat) => {
    console.log("data permission is: ", dat);
    if (dat.permissionGranted) {
      userConnect(dat.data);
    } else {
      socket.to(dat.data.connectionId).emit("permission_denied");
      socket.disconnect();
    }
  });

  socket.on("SDPProcess", (data) => {
    socket.to(data.to_connid).emit("SDPProcess", {
      message: data.message,
      from_connid: socket.id,
    });
  });
  socket.on("sendMessage", (msg) => {
    console.log(msg);
    const mUser = userConnections.find((p) => p.connectionId == socket.id);
    if (mUser) {
      const meetingid = mUser.meeting_id;
      const from = mUser.user_id;
      const list = userConnections.filter((p) => p.meeting_id == meetingid);
      list.forEach((v) => {
        socket.to(v.connectionId).emit("showChatMessage", {
          from: from,
          message: msg,
        });
      });
    }
  });
  socket.on("fileTransferToOther", (msg) => {
    console.log(msg);
    const mUser = userConnections.find((p) => p.connectionId == socket.id);
    if (mUser) {
      const meetingid = mUser.meeting_id;
      const from = mUser.user_id;
      const list = userConnections.filter((p) => p.meeting_id == meetingid);
      list.forEach((v) => {
        socket.to(v.connectionId).emit("showFileMessage", {
          username: msg.username,
          meetingid: msg.meetingid,
          filePath: msg.filePath,
          fileName: msg.fileName,
        });
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected");
    const disUser = userConnections.find((p) => p.connectionId == socket.id);
    if (disUser) {
      const meetingid = disUser.meeting_id;
      userConnections = userConnections.filter(
        (p) => p.connectionId != socket.id
      );
      const list = userConnections.filter((p) => p.meeting_id == meetingid);
      list.forEach((v) => {
        const userNumberAfUserLeave = userConnections.length;
        socket.to(v.connectionId).emit("inform_other_about_disconnected_user", {
          connId: socket.id,
          uNumber: userNumberAfUserLeave,
        });
      });
    }
  });

  socket.on("sendHandRaise", (data) => {
    const senderID = userConnections.find((p) => p.connectionId == socket.id);
    console.log("senderID :", senderID.meeting_id);
    if (senderID.meeting_id) {
      const meetingid = senderID.meeting_id;
      const list = userConnections.filter((p) => p.meeting_id == meetingid);
      list.forEach((v) => {
        const userNumberAfUserLeave = userConnections.length;
        socket.to(v.connectionId).emit("HandRaise_info_for_others", {
          connId: socket.id,
          handRaise: data,
        });
      });
    }
  });
});

app.use(fileUpload());
app.post("/attachimg", (req, res) => {
  const data = req.body;
  const imageFile = req.files.zipfile;
  console.log(imageFile);
  const dir = "public/attachment/" + data.meeting_id + "/";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }

  imageFile.mv(
    "public/attachment/" + data.meeting_id + "/" + imageFile.name,
    (error) => {
      if (error) {
        console.log("couldn't upload the image file , error: ", error);
      } else {
        console.log("Image file successfully uploaded");
      }
    }
  );
});
