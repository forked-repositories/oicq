"use strict";
const querystring = require("querystring");
const https = require("https");
const { uinAutoCheck } = require("./common");
const pb = require("./pb");
const jce = require("./jce");

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @param {Boolean} enable 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setAdmin(group_id, user_id, enable = true) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const buf = Buffer.allocUnsafe(9);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(user_id, 4), buf.writeUInt8(enable ? 1 : 0, 8);
    const blob = await this.sendUNI("OidbSvc.0x55c_1", buf);
    const result = pb.decode(blob)[3];
    if (result === 0) {
        try {
            const old_role = this.gml.get(group_id).get(user_id).role;
            const new_role = enable ? "admin" : "member";
            if (old_role !== new_role && old_role !== "owner") {
                this.gml.get(group_id).get(user_id).role = new_role;
                setImmediate(() => {
                    this.em("notice.group.admin", {
                        group_id, user_id, set: !!enable
                    });
                });
            }
        } catch (e) { }
    }
    return { result };
}

/**
 * 设置头衔
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @param {String} title 
 * @param {Number} duration 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setTitle(group_id, user_id, title = "", duration = -1) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    title = String(title);
    duration = parseInt(duration) & 0xffffffff;
    const body = pb.encode({
        1: group_id,
        3: [{
            1: user_id,
            7: title,
            5: title,
            6: duration ? duration : -1
        }]
    });
    const blob = await this.sendUNI("OidbSvc.0x8fc_2", body);
    return { result: pb.decode(blob)[3] };
}

/**
 * 群设置
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {String} k 
 * @param {any} v 
 * @returns {import("./ref").ProtocolResponse}
 */
async function doSetting(group_id, k, v) {
    [group_id] = uinAutoCheck(group_id);
    const settings = {
        shutupTime: 17,
        ingGroupName: 3,
        ingGroupMemo: 4,
    };
    const tag = settings[k];
    if (!tag)
        throw new Error("unknown setting key");
    const body = {
        1: group_id,
        2: {},
    };
    body[2][tag] = v;
    await this.sendUNI("OidbSvc.0x89a_0", pb.encode(body));
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @param {String} card 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setCard(group_id, user_id, card = "") {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const MGCREQ = jce.encodeStruct([
        0, group_id, 0, [
            jce.encodeNested([
                user_id, 31, String(card), 0, "", "", ""
            ])
        ]
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "mqq.IMService.FriendListServiceServantObj",
        method: "ModifyGroupCardReq",
    };
    const body = jce.encodeWrapper({ MGCREQ }, extra);
    const blob = await this.sendUNI("friendlist.ModifyGroupCardReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    const result = parent[3].length > 0 ? 0 : 1;
    return { result };
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @param {Boolean} block 
 * @returns {import("./ref").ProtocolResponse}
 */
async function kickMember(group_id, user_id, block = false) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const body = pb.encode({
        1: group_id,
        2: [{
            1: 5,
            2: user_id,
            3: block ? 1 : 0,
        }],
    });
    const blob = await this.sendUNI("OidbSvc.0x8a0_0", body);
    const o = pb.decode(blob)[4];
    const result = o[2][1];
    try {
        var member = this.gml.get(group_id).get(user_id);
    } catch { }
    if (result === 0 && this.gml.has(group_id) && this.gml.get(group_id).delete(user_id)) {
        setImmediate(() => {
            this.em("notice.group.decrease", {
                group_id, user_id,
                operator_id: this.uin,
                dismiss: false, member
            });
        });
    }
    return { result };
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @param {Number} duration 
 * @returns {import("./ref").ProtocolResponse}
 */
async function muteMember(group_id, user_id, duration = 1800) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    duration = parseInt(duration);
    if (duration > 2592000 || duration < 0)
        duration = 2592000;
    const buf = Buffer.allocUnsafe(15);
    buf.writeUInt32BE(group_id), buf.writeUInt8(32, 4), buf.writeUInt16BE(1, 5);
    buf.writeUInt32BE(user_id, 7), buf.writeUInt32BE(duration ? duration : 0, 11);
    await this.sendUNI("OidbSvc.0x570_8", buf);
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Boolean} dismiss 
 * @returns {import("./ref").ProtocolResponse}
 */
async function quitGroup(group_id, dismiss = false) {
    [group_id] = uinAutoCheck(group_id);
    let command, buf = Buffer.allocUnsafe(8);
    if (dismiss) {
        command = 9;
        buf.writeUInt32BE(group_id), buf.writeUInt32BE(this.uin, 4);
    } else {
        command = 2;
        buf.writeUInt32BE(this.uin), buf.writeUInt32BE(group_id, 4);
    }
    const GroupMngReq = jce.encodeStruct([
        command, this.uin, buf
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "KQQ.ProfileService.ProfileServantObj",
        method: "GroupMngReq",
    };
    const body = jce.encodeWrapper({ GroupMngReq }, extra);
    const blob = await this.sendUNI("ProfileService.GroupMngReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return { result: parent[1] };
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 发送的对象，可以是好友uin
 * @param {Number} user_id 戳一戳的对象
 * @returns {import("./ref").ProtocolResponse}
 */
async function pokeMember(group_id, user_id) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const o = { 1: user_id };
    if (this.gl.has(group_id) || !this.fl.has(group_id))
        o[2] = group_id;
    else
        o[5] = group_id;
    const body = pb.encode(o);
    await this.sendUNI("OidbSvc.0xed3", body);
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {String} comment 
 * @returns {import("./ref").ProtocolResponse}
 */
async function addGroup(group_id, comment = "") {
    [group_id] = uinAutoCheck(group_id);
    comment = Buffer.from(String(comment)).slice(0, 255);
    const buf = Buffer.allocUnsafe(9 + comment.length);
    buf.writeUInt32BE(group_id), buf.writeUInt32BE(this.uin, 4), buf.writeUInt8(comment.length, 8);
    buf.fill(comment, 9);
    const GroupMngReq = jce.encodeStruct([
        1,
        this.uin, buf, 0, "", 0, 3, 30002, 0, 0, 0,
        null, "", null, "", "", 0
    ]);
    const extra = {
        req_id: this.seq_id + 1,
        service: "KQQ.ProfileService.ProfileServantObj",
        method: "GroupMngReq",
    };
    const body = jce.encodeWrapper({ GroupMngReq }, extra);
    const blob = await this.sendUNI("ProfileService.GroupMngReq", body);
    const nested = jce.decodeWrapper(blob);
    const parent = jce.decode(nested);
    return { result: parent[1] };
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Number} user_id 
 * @returns {import("./ref").ProtocolResponse}
 */
async function inviteFriend(group_id, user_id) {
    [group_id, user_id] = uinAutoCheck(group_id, user_id);
    const body = pb.encode({
        1: group_id,
        2: { 1: user_id }
    });
    const blob = await this.sendUNI("OidbSvc.oidb_0x758", body);
    const result = pb.decode(blob)[4].raw.length > 6 ? 0 : 1;
    return { result };
}

/**
 * 启用/禁用 匿名
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {Boolean} enable 
 * @returns {import("./ref").ProtocolResponse}
 */
async function setAnonymous(group_id, enable = true) {
    [group_id] = uinAutoCheck(group_id);
    const buf = Buffer.allocUnsafe(5);
    buf.writeUInt32BE(group_id), buf.writeUInt8(enable ? 1 : 0, 4);
    await this.sendUNI("OidbSvc.0x568_22", buf);
}

/**
 * @param {String} flag 
 */
function parseAnonFlag(flag) {
    const split = flag.split("@");
    return {
        id: split[1],
        nick: split[0],
    };
}

/**
 * @this {import("./ref").Client}
 * @param {Number} group_id 
 * @param {String} flag 
 * @param {Number} duration
 * @returns {import("./ref").ProtocolResponse} 
 */
async function muteAnonymous(group_id, flag, duration = 1800) {
    [group_id] = uinAutoCheck(group_id);
    duration = parseInt(duration);
    if (duration > 2592000 || duration < 0)
        duration = 2592000;
    const { id, nick } = parseAnonFlag(flag);
    const body = querystring.stringify({
        anony_id: id,
        group_code: group_id,
        seconds: duration,
        anony_nick: nick,
        bkn: (await this.getCsrfToken()).data.token
    });
    const cookie = (await this.getCookies("qqweb.qq.com")).data.cookies;
    try {
        const rsp = await new Promise((resolve, reject) => {
            https.request("https://qqweb.qq.com/c/anonymoustalk/blacklist", {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded", cookie
                }
            }, (res) => {
                res.on("data", (chunk) => {
                    try {
                        const data = JSON.parse(chunk);
                        resolve({
                            result: data.retcode,
                            emsg: data.msg
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on("error", reject).end(body);
        });
        return rsp;
    } catch (e) {
        return { result: -1, emsg: e.message };
    }
}

module.exports = {
    setAdmin, setTitle, setCard, doSetting, setAnonymous, muteAnonymous,
    kickMember, muteMember, pokeMember, quitGroup, addGroup, inviteFriend,
};
