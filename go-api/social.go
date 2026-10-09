package main

// The community: friends (a request, then a friendship once accepted), conversations between two friends or within a
// group, and groups, which their owner and admins run. Groups also hold tournaments, and any conversation battles
// (tournament.go): each shows in its conversation as a card, a message that carries it.
//
// The HTTP routes live under /api/social (`socialRoute`, run on the database thread). What changes reaches the open
// apps of the accounts concerned on their socket (live.go), as `{"channel": "social", "type": …}` events.

import (
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

const socialUnknownUser = "Unknown player"
const socialUnknownGroup = "Unknown group"
const socialUnknownConversation = "Unknown conversation"

// Messages a page of a conversation holds.
const socialPage int64 = 100

// optID is an `Option<i64>` id as an SQL parameter: 0 is NULL.
func optID(id int64) any {
	if id == 0 {
		return nil
	}
	return id
}

// optStr is an `Option<&str>` as an SQL parameter: "" is NULL.
func optStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// socialNotify tells every open app of these accounts.
func socialNotify(state *AppState, users []string, kind string, value M) {
	value["type"] = kind
	text := liveText("social", value)
	for _, user := range users {
		state.coaching.tell(user, text)
	}
}

// socialPerson: a player as the community shows them.
func socialPerson(id, name, avatar any) M {
	return M{"id": id, "username": name, "avatar": coachingAvatarURL(avatar)}
}

func socialTrimmed(body any, key string, min, max int) (string, error) {
	s, err := apiString(body, key, 0, max)
	if err != nil {
		return "", err
	}
	text := strings.TrimSpace(s)
	if utf8.RuneCountInString(text) < min {
		return "", validation()
	}
	return text, nil
}

// socialOptional: optional trimmed text of at most `max` characters: empty when absent or null.
func socialOptional(body any, key string, max int) (string, error) {
	if v, ok := get(body, key); !ok || v == nil {
		return "", nil
	}
	return socialTrimmed(body, key, 0, max)
}

// socialUserIds: the `user_id` column of a query, as account ids.
func socialUserIds(db *Conn, sql string, args ...any) ([]string, error) {
	rows, err := dbAll(db, sql, args...)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, r := range rows {
		if id, ok := asStr(r["user_id"]); ok {
			out = append(out, id)
		}
	}
	return out, nil
}

// socialAccount: a signed-in account by its username.
func socialAccount(db *Conn, name string) (M, error) {
	row, err := dbOne(db, "SELECT id,username,avatar FROM users WHERE username=? COLLATE NOCASE AND password_hash IS NOT NULL", strings.TrimSpace(name))
	if err == nil && row == nil {
		err = apiErr(404, socialUnknownUser)
	}
	return row, err
}

func socialAccountByID(db *Conn, id string) (M, error) {
	return dbRequired(db, "SELECT id,username,avatar FROM users WHERE id=? AND password_hash IS NOT NULL", socialUnknownUser, id)
}

// Friends.

// socialRelation: where two accounts stand: friends, a request one way or the other, or nothing.
func socialRelation(db *Conn, uid, other string) (string, error) {
	row, err := dbOne(db, "SELECT user_id,status FROM friends WHERE (user_id=?1 AND friend_id=?2) OR (user_id=?2 AND friend_id=?1)", uid, other)
	switch {
	case err != nil:
		return "", err
	case row == nil:
		return "none", nil
	case eqStr(row["status"], "accepted"):
		return "friend", nil
	case eqStr(row["user_id"], uid):
		return "outgoing", nil
	}
	return "incoming", nil
}

func socialFriends(db *Conn, uid string) (M, error) {
	rows, err := dbAll(db, `SELECT f.user_id,f.status,f.created_at,f.accepted_at,u.id,u.username,u.avatar FROM friends f
         JOIN users u ON u.id=CASE WHEN f.user_id=?1 THEN f.friend_id ELSE f.user_id END
         WHERE f.user_id=?1 OR f.friend_id=?1 ORDER BY u.username COLLATE NOCASE`, uid)
	if err != nil {
		return nil, err
	}
	list, incoming, outgoing := []any{}, []any{}, []any{}
	for _, r := range rows {
		p := socialPerson(r["id"], r["username"], r["avatar"])
		if eqStr(r["status"], "accepted") {
			p["since"] = r["accepted_at"]
			list = append(list, p)
		} else {
			p["at"] = r["created_at"]
			if eqStr(r["user_id"], uid) {
				outgoing = append(outgoing, p)
			} else {
				incoming = append(incoming, p)
			}
		}
	}
	return M{"friends": list, "incoming": incoming, "outgoing": outgoing}, nil
}

// socialBefriend asks `other` to be friends; when they already asked, the friendship is made.
func socialBefriend(db *Conn, state *AppState, user, other M) (any, error) {
	uid, oid := str(user["id"]), str(other["id"])
	if uid == oid {
		return nil, apiErr(400, "That is you.")
	}
	relation, err := socialRelation(db, uid, oid)
	if err != nil {
		return nil, err
	}
	switch relation {
	case "friend":
		return nil, apiErr(409, "You are already friends.")
	case "outgoing":
		return nil, apiErr(409, "Your request is waiting for an answer.")
	case "incoming":
		return socialAccept(db, state, user, oid)
	}
	if _, err := db.Exec("INSERT INTO friends(user_id,friend_id,status,created_at) VALUES(?,?,'pending',?)", uid, oid, accountsNow()); err != nil {
		return nil, err
	}
	socialNotify(state, []string{oid}, "request", M{"from": socialPerson(user["id"], user["username"], user["avatar"])})
	socialNotify(state, []string{uid}, "friends", M{})
	return M{"relation": "outgoing"}, nil
}

func socialAccept(db *Conn, state *AppState, user M, other string) (any, error) {
	uid := str(user["id"])
	changed, err := db.Exec("UPDATE friends SET status='accepted',accepted_at=? WHERE user_id=? AND friend_id=? AND status='pending'", accountsNow(), other, uid)
	if err != nil {
		return nil, err
	}
	if changed == 0 {
		return nil, apiErr(404, "No request from this player.")
	}
	socialNotify(state, []string{other}, "accepted", M{"by": socialPerson(user["id"], user["username"], user["avatar"])})
	socialNotify(state, []string{uid}, "friends", M{})
	return M{"relation": "friend"}, nil
}

// Conversations.

// socialParticipants: the members of a conversation: its two friends, or its group's members (invited ones excepted).
func socialParticipants(db *Conn, conversation M) ([]string, error) {
	if group, ok := asInt(conversation["group_id"]); ok {
		return socialMembers(db, group)
	}
	out := []string{}
	for _, v := range []any{conversation["user_a"], conversation["user_b"]} {
		if s, ok := asStr(v); ok {
			out = append(out, s)
		}
	}
	return out, nil
}

// socialRequireFriend fails unless the two accounts are friends: only friends write to each other.
func socialRequireFriend(db *Conn, uid, other string) error {
	relation, err := socialRelation(db, uid, other)
	if err != nil {
		return err
	}
	if relation != "friend" {
		return apiErr(403, "You can write to your friends only.")
	}
	return nil
}

// socialConversation: a conversation the account belongs to.
func socialConversation(db *Conn, id int64, uid string) (M, error) {
	row, err := dbRequired(db, "SELECT * FROM social_conversations WHERE id=?", socialUnknownConversation, id)
	if err != nil {
		return nil, err
	}
	participants, err := socialParticipants(db, row)
	if err != nil {
		return nil, err
	}
	for _, p := range participants {
		if p == uid {
			return row, nil
		}
	}
	return nil, apiErr(404, socialUnknownConversation)
}

// socialDirect: the conversation of two friends, created on first need.
func socialDirect(db *Conn, a, b string) (int64, error) {
	if a > b {
		a, b = b, a
	}
	if _, err := db.Exec("INSERT OR IGNORE INTO social_conversations(user_a,user_b,updated_at) VALUES(?,?,?)", a, b, accountsNow()); err != nil {
		return 0, err
	}
	row, err := dbRequired(db, "SELECT id FROM social_conversations WHERE user_a=? AND user_b=?", socialUnknownConversation, a, b)
	if err != nil {
		return 0, err
	}
	id, _ := asInt(row["id"])
	return id, nil
}

const socialConversationsSQL = `SELECT c.id,c.group_id,c.user_a,c.user_b,c.updated_at,g.name group_name,
  u.id other_id,u.username other_name,u.avatar other_avatar,
  lm.body last_body,lm.sender_id last_sender,lm.created_at last_at,ls.username last_sender_name,
  lm.match_id last_match,lm.tournament_id last_tournament,
  (SELECT count(*) FROM social_messages x WHERE x.conversation_id=c.id AND x.sender_id!=?1
    AND x.id>COALESCE((SELECT message_id FROM social_reads r WHERE r.conversation_id=c.id AND r.user_id=?1),0)) unread,
  f.user_id IS NOT NULL friends
 FROM social_conversations c
 LEFT JOIN social_groups g ON g.id=c.group_id
 LEFT JOIN users u ON c.group_id IS NULL AND u.id=CASE WHEN c.user_a=?1 THEN c.user_b ELSE c.user_a END
 LEFT JOIN social_messages lm ON lm.id=(SELECT max(id) FROM social_messages WHERE conversation_id=c.id)
 LEFT JOIN users ls ON ls.id=lm.sender_id
 LEFT JOIN friends f ON u.id IS NOT NULL AND f.status='accepted' AND ((f.user_id=?1 AND f.friend_id=u.id) OR (f.user_id=u.id AND f.friend_id=?1))
 WHERE (c.user_a=?1 OR c.user_b=?1 OR c.group_id IN (SELECT group_id FROM group_members WHERE user_id=?1 AND role!='invited'))`

func socialConversationDto(row M, uid string) M {
	group, isGroup := asInt(row["group_id"])
	// Two players may write while they are friends; a group's members always.
	open := isGroup || eqInt(row["friends"], 1)
	kind := "direct"
	var with, g, last any
	if isGroup {
		kind = "group"
		g = M{"id": group, "name": row["group_name"]}
	} else {
		with = socialPerson(row["other_id"], row["other_name"], row["other_avatar"])
	}
	if row["last_body"] != nil {
		last = M{"body": row["last_body"], "at": row["last_at"], "mine": eqStr(row["last_sender"], uid), "from": row["last_sender_name"],
			"card": socialAttachment(row["last_match"], row["last_tournament"])}
	}
	return M{
		"id":          row["id"],
		"kind":        kind,
		"with":        with,
		"group":       g,
		"lastMessage": last,
		"unread":      row["unread"],
		"updatedAt":   row["updated_at"],
		"open":        open,
	}
}

func socialConversations(db *Conn, uid string) (any, error) {
	rows, err := dbAll(db, socialConversationsSQL+" ORDER BY c.updated_at DESC", uid)
	if err != nil {
		return nil, err
	}
	out := make([]any, len(rows))
	for i, r := range rows {
		out[i] = socialConversationDto(r, uid)
	}
	return out, nil
}

func socialConversationView(db *Conn, id int64, uid string) (any, error) {
	row, err := dbRequired(db, socialConversationsSQL+" AND c.id=?2", socialUnknownConversation, uid, id)
	if err != nil {
		return nil, err
	}
	return socialConversationDto(row, uid), nil
}

// socialUnread: messages of others the account has not read, in all its conversations.
func socialUnread(db *Conn, uid string) (int64, error) {
	row, err := dbOne(db, `SELECT count(*) n FROM social_messages m JOIN social_conversations c ON c.id=m.conversation_id
         LEFT JOIN social_reads r ON r.conversation_id=c.id AND r.user_id=?1
         WHERE m.sender_id!=?1 AND m.id>COALESCE(r.message_id,0)
           AND (c.user_a=?1 OR c.user_b=?1 OR c.group_id IN (SELECT group_id FROM group_members WHERE user_id=?1 AND role!='invited'))`, uid)
	if err != nil {
		return 0, err
	}
	n, _ := asInt(idx(row, "n"))
	return n, nil
}

const socialMessageSQL = `SELECT m.id,m.sender_id,m.body,m.created_at,m.match_id,m.tournament_id,u.username,u.avatar
 FROM social_messages m JOIN users u ON u.id=m.sender_id`

// socialAttachment: what a message carries besides its words: a battle (`match`), a tournament, or nothing.
func socialAttachment(matchID, tournamentID any) any {
	if matchID != nil {
		return "match"
	}
	if tournamentID != nil {
		return "tournament"
	}
	return nil
}

// socialMessageDto: a message, with its card as it stands now when it carries one (the tournament as the account `uid`
// sees it; "" for none).
func socialMessageDto(db *Conn, row M, uid string) (M, error) {
	value := M{"id": row["id"], "senderId": row["sender_id"], "sender": socialPerson(row["sender_id"], row["username"], row["avatar"]), "body": row["body"], "createdAt": row["created_at"]}
	if m, ok := asInt(row["match_id"]); ok {
		card, err := tournamentMatchCard(db, m)
		if err != nil {
			return nil, err
		}
		value["match"] = card
	}
	if t, ok := asInt(row["tournament_id"]); ok {
		card, err := tournamentTournamentCard(db, t, uid)
		if err != nil {
			return nil, err
		}
		value["tournament"] = card
	}
	return value, nil
}

// SocialCard: what a message holds besides words: a battle or a tournament (0 for none); its words may then be empty.
type SocialCard struct {
	matchID      int64
	tournamentID int64
}

// socialPost writes in a conversation and brings the message to the open apps of its members.
func socialPost(db *Conn, state *AppState, conversation M, user M, body string, card SocialCard) (M, error) {
	id, _ := asInt(conversation["id"])
	uid, at := str(user["id"]), accountsNow()
	if _, err := db.Exec("INSERT INTO social_messages(conversation_id,sender_id,body,created_at,match_id,tournament_id) VALUES(?,?,?,?,?,?)",
		id, uid, body, at, optID(card.matchID), optID(card.tournamentID)); err != nil {
		return nil, err
	}
	messageID := db.LastInsertRowid()
	if _, err := db.Exec("UPDATE social_conversations SET updated_at=? WHERE id=?", at, id); err != nil {
		return nil, err
	}
	if err := socialRead(db, id, uid, messageID); err != nil {
		return nil, err
	}
	row, err := dbRequired(db, socialMessageSQL+" WHERE m.id=?", socialUnknownConversation, messageID)
	if err != nil {
		return nil, err
	}
	message, err := socialMessageDto(db, row, "")
	if err != nil {
		return nil, err
	}
	var title any
	if group, ok := asInt(conversation["group_id"]); ok {
		r, err := dbOne(db, "SELECT name FROM social_groups WHERE id=?", group)
		if err != nil {
			return nil, err
		}
		title = idx(r, "name")
	} else {
		title = user["username"]
	}
	participants, err := socialParticipants(db, conversation)
	if err != nil {
		return nil, err
	}
	socialNotify(state, participants, "message", M{"conversation": id, "message": message, "title": title})
	return message, nil
}

func socialRead(db *Conn, conversation int64, uid string, message int64) error {
	_, err := db.Exec(`INSERT INTO social_reads(conversation_id,user_id,message_id) VALUES(?1,?2,?3)
         ON CONFLICT(conversation_id,user_id) DO UPDATE SET message_id=max(message_id,excluded.message_id)`, conversation, uid, message)
	return err
}

// Groups.

// socialRole: the account's place in a group: owner, admin, member or invited; an error when it has none.
func socialRole(db *Conn, group int64, uid string) (string, error) {
	row, err := dbOne(db, "SELECT role FROM group_members WHERE group_id=? AND user_id=?", group, uid)
	if err != nil {
		return "", err
	}
	role, ok := asStr(idx(row, "role"))
	if !ok {
		return "", apiErr(404, socialUnknownGroup)
	}
	return role, nil
}

// socialMember fails unless the account is in the group, or runs it when `organise`.
func socialMember(db *Conn, group int64, uid string, organise bool) (string, error) {
	role, err := socialRole(db, group, uid)
	if err != nil {
		return "", err
	}
	if role == "invited" {
		return "", apiErr(404, socialUnknownGroup)
	}
	if organise && role == "member" {
		return "", apiErr(403, "Only the group's owner and admins can do that.")
	}
	return role, nil
}

func socialMembers(db *Conn, group int64) ([]string, error) {
	return socialUserIds(db, "SELECT user_id FROM group_members WHERE group_id=? AND role!='invited'", group)
}

func socialGroupSummary(row M) M {
	return M{"id": row["id"], "name": row["name"], "description": row["description"], "members": row["members"], "role": row["role"], "createdAt": row["created_at"]}
}

func socialGroups(db *Conn, uid string) (joined, invited []any, err error) {
	rows, err := dbAll(db, `SELECT g.*,m.role,(SELECT count(*) FROM group_members x WHERE x.group_id=g.id AND x.role!='invited') members,
         i.username invited_by FROM social_groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=?
         LEFT JOIN users i ON i.id=m.invited_by ORDER BY g.name COLLATE NOCASE`, uid)
	if err != nil {
		return nil, nil, err
	}
	joined, invited = []any{}, []any{}
	for _, r := range rows {
		g := socialGroupSummary(r)
		if eqStr(r["role"], "invited") {
			g["invitedBy"] = r["invited_by"]
			invited = append(invited, g)
		} else {
			joined = append(joined, g)
		}
	}
	return joined, invited, nil
}

func socialGroup(db *Conn, id int64, uid string) (any, error) {
	role, err := socialMember(db, id, uid, false)
	if err != nil {
		return nil, err
	}
	row, err := dbRequired(db, "SELECT * FROM social_groups WHERE id=?", socialUnknownGroup, id)
	if err != nil {
		return nil, err
	}
	people, err := dbAll(db, `SELECT m.role,m.joined_at,u.id,u.username,u.avatar FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=?
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,u.username COLLATE NOCASE`, id)
	if err != nil {
		return nil, err
	}
	c, err := dbOne(db, "SELECT id FROM social_conversations WHERE group_id=?", id)
	if err != nil {
		return nil, err
	}
	members := make([]any, len(people))
	for i, p := range people {
		v := socialPerson(p["id"], p["username"], p["avatar"])
		v["role"] = p["role"]
		v["joinedAt"] = p["joined_at"]
		members[i] = v
	}
	tournaments, err := tournamentList(db, id, uid)
	if err != nil {
		return nil, err
	}
	battles, err := tournamentBattles(db, id)
	if err != nil {
		return nil, err
	}
	return M{
		"id":             id,
		"name":           row["name"],
		"description":    row["description"],
		"ownerId":        row["owner_id"],
		"createdAt":      row["created_at"],
		"role":           role,
		"conversationId": idx(c, "id"),
		"members":        members,
		"tournaments":    tournaments,
		"battles":        battles,
	}, nil
}

func socialCreateGroup(db *Conn, state *AppState, uid string, body any) (any, error) {
	name, err := socialTrimmed(body, "name", 2, 40)
	if err != nil {
		return nil, err
	}
	description, err := socialOptional(body, "description", 300)
	if err != nil {
		return nil, err
	}
	at := accountsNow()
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := db.Exec("INSERT INTO social_groups(name,description,owner_id,created_at) VALUES(?,?,?,?)", name, description, uid, at); err != nil {
		return nil, err
	}
	id := db.LastInsertRowid()
	if _, err := db.Exec("INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,'owner',?)", id, uid, at); err != nil {
		return nil, err
	}
	if _, err := db.Exec("INSERT INTO social_conversations(group_id,updated_at) VALUES(?,?)", id, at); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	socialNotify(state, []string{uid}, "groups", M{})
	// The friends picked as it was made are invited at once.
	list, _ := asArray(idx(body, "invite"))
	picked := 0
	for _, v := range list {
		other, ok := asStr(v)
		if !ok {
			continue
		}
		if picked == 50 {
			break
		}
		picked++
		relation, err := socialRelation(db, uid, other)
		if err != nil {
			return nil, err
		}
		if relation == "friend" {
			byName, err := socialUserName(db, uid)
			if err != nil {
				return nil, err
			}
			if err := socialInvite(db, state, id, uid, byName, other); err != nil {
				return nil, err
			}
		}
	}
	return socialGroup(db, id, uid)
}

func socialUserName(db *Conn, id string) (any, error) {
	row, err := socialAccountByID(db, id)
	if err != nil {
		return nil, err
	}
	return row["username"], nil
}

// socialInvite invites an account to a group, unless it is in it or invited already.
func socialInvite(db *Conn, state *AppState, group int64, by string, byName any, other string) error {
	existing, err := dbOne(db, "SELECT 1 FROM group_members WHERE group_id=? AND user_id=?", group, other)
	if err != nil {
		return err
	}
	if existing != nil {
		return apiErr(409, "This player is already in the group, or invited.")
	}
	if _, err := db.Exec("INSERT INTO group_members(group_id,user_id,role,invited_by,joined_at) VALUES(?,?,'invited',?,?)", group, other, by, accountsNow()); err != nil {
		return err
	}
	row, err := dbRequired(db, "SELECT name FROM social_groups WHERE id=?", socialUnknownGroup, group)
	if err != nil {
		return err
	}
	socialNotify(state, []string{other}, "invitation", M{"group": group, "name": row["name"], "from": byName})
	return nil
}

// socialGroupConversation: the conversation of a group.
func socialGroupConversation(db *Conn, group int64) (M, error) {
	return dbRequired(db, "SELECT * FROM social_conversations WHERE group_id=?", socialUnknownConversation, group)
}

// socialChanged tells the group's members (and the invited, with `invited`) that it changed.
func socialChanged(db *Conn, state *AppState, id int64, invited bool) error {
	var users []string
	var err error
	if invited {
		users, err = socialUserIds(db, "SELECT user_id FROM group_members WHERE group_id=?", id)
	} else {
		users, err = socialMembers(db, id)
	}
	if err != nil {
		return err
	}
	socialNotify(state, users, "group", M{"group": id})
	return nil
}

func socialRoute(db *Conn, state *AppState, method string, parts []string, query map[string]string, body any, user M) (any, error) {
	if user["password_hash"] == nil {
		return nil, apiErr(403, "Sign in to meet other players.")
	}
	uid := str(user["id"])
	number := func(s string) (int64, error) {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return 0, validation()
		}
		return n, nil
	}
	is := func(m string, pattern ...string) bool { return method == m && matchParts(parts, pattern...) }
	switch {
	// Everything the community page opens with.
	case is("GET", "me"):
		joined, invited, err := socialGroups(db, uid)
		if err != nil {
			return nil, err
		}
		value, err := socialFriends(db, uid)
		if err != nil {
			return nil, err
		}
		value["groups"] = joined
		value["invitations"] = invited
		if value["unread"], err = socialUnread(db, uid); err != nil {
			return nil, err
		}
		return value, nil
	case is("GET", "users"):
		q := strings.ToLower(strings.TrimSpace(query["q"]))
		if q == "" || utf8.RuneCountInString(q) > 24 {
			return []any{}, nil
		}
		// The name's own characters, LIKE's wildcards among them, then anything after.
		pattern := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
		rows, err := dbAll(db, "SELECT id,username,avatar FROM users WHERE password_hash IS NOT NULL AND id!=? AND username LIKE ? ESCAPE '\\' ORDER BY length(username),username LIMIT 12", uid, pattern)
		if err != nil {
			return nil, err
		}
		out := make([]any, len(rows))
		for i, r := range rows {
			p := socialPerson(r["id"], r["username"], r["avatar"])
			relation, err := socialRelation(db, uid, str(r["id"]))
			if err != nil {
				relation = "none"
			}
			p["relation"] = relation
			out[i] = p
		}
		return out, nil
	case is("POST", "friends"):
		name, err := apiString(body, "username", 1, 24)
		if err != nil {
			return nil, err
		}
		other, err := socialAccount(db, name)
		if err != nil {
			return nil, err
		}
		return socialBefriend(db, state, user, other)
	case is("POST", "friends", "*", "accept"):
		return socialAccept(db, state, user, parts[1])
	// Declines a request, takes one back, or ends a friendship.
	case is("DELETE", "friends", "*"):
		id := parts[1]
		gone, err := db.Exec("DELETE FROM friends WHERE (user_id=?1 AND friend_id=?2) OR (user_id=?2 AND friend_id=?1)", uid, id)
		if err != nil {
			return nil, err
		}
		if gone == 0 {
			return nil, apiErr(404, socialUnknownUser)
		}
		socialNotify(state, []string{uid, id}, "friends", M{})
		return M{"relation": "none"}, nil
	case is("GET", "conversations"):
		return socialConversations(db, uid)
	case is("POST", "conversations"):
		otherID, err := apiString(body, "userId", 1, 64)
		if err != nil {
			return nil, err
		}
		other, err := socialAccountByID(db, otherID)
		if err != nil {
			return nil, err
		}
		oid := str(other["id"])
		if err := socialRequireFriend(db, uid, oid); err != nil {
			return nil, err
		}
		id, err := socialDirect(db, uid, oid)
		if err != nil {
			return nil, err
		}
		return socialConversationView(db, id, uid)
	case is("GET", "conversations", "*"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		if _, err := socialConversation(db, id, uid); err != nil {
			return nil, err
		}
		return socialConversationView(db, id, uid)
	case is("GET", "conversations", "*", "messages"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		if _, err := socialConversation(db, id, uid); err != nil {
			return nil, err
		}
		before := int64(math.MaxInt64)
		if b, ok := query["before"]; ok {
			if before, err = number(b); err != nil {
				return nil, err
			}
		}
		rows, err := dbAll(db, socialMessageSQL+" WHERE m.conversation_id=? AND m.id<? ORDER BY m.id DESC LIMIT ?", id, before, socialPage)
		if err != nil {
			return nil, err
		}
		out := make([]any, len(rows))
		for i, r := range rows {
			message, err := socialMessageDto(db, r, uid)
			if err != nil {
				return nil, err
			}
			out[len(rows)-1-i] = message
		}
		return out, nil
	case is("POST", "conversations", "*", "messages"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		row, err := socialConversation(db, id, uid)
		if err != nil {
			return nil, err
		}
		_, isGroup := asInt(row["group_id"])
		a, okA := asStr(row["user_a"])
		b, okB := asStr(row["user_b"])
		if !isGroup && okA && okB {
			other := a
			if a == uid {
				other = b
			}
			if err := socialRequireFriend(db, uid, other); err != nil {
				return nil, err
			}
		}
		text, err := socialTrimmed(body, "body", 1, 1000)
		if err != nil {
			return nil, err
		}
		return socialPost(db, state, row, user, text, SocialCard{})
	case is("POST", "conversations", "*", "read"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		if _, err := socialConversation(db, id, uid); err != nil {
			return nil, err
		}
		row, err := dbOne(db, "SELECT max(id) id FROM social_messages WHERE conversation_id=?", id)
		if err != nil {
			return nil, err
		}
		last, _ := asInt(idx(row, "id"))
		if err := socialRead(db, id, uid, last); err != nil {
			return nil, err
		}
		unread, err := socialUnread(db, uid)
		if err != nil {
			return nil, err
		}
		return M{"unread": unread}, nil
	case is("POST", "groups"):
		return socialCreateGroup(db, state, uid, body)
	case is("GET", "groups", "*"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		return socialGroup(db, id, uid)
	case is("PUT", "groups", "*"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		if _, err := socialMember(db, id, uid, true); err != nil {
			return nil, err
		}
		name, err := socialTrimmed(body, "name", 2, 40)
		if err != nil {
			return nil, err
		}
		description, err := socialTrimmed(body, "description", 0, 300)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec("UPDATE social_groups SET name=?,description=? WHERE id=?", name, description, id); err != nil {
			return nil, err
		}
		if err := socialChanged(db, state, id, true); err != nil {
			return nil, err
		}
		return socialGroup(db, id, uid)
	case is("DELETE", "groups", "*"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		role, err := socialMember(db, id, uid, true)
		if err != nil {
			return nil, err
		}
		if role != "owner" {
			return nil, apiErr(403, "Only the group's owner can delete it.")
		}
		users, err := socialUserIds(db, "SELECT user_id FROM group_members WHERE group_id=?", id)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec("DELETE FROM social_groups WHERE id=?", id); err != nil {
			return nil, err
		}
		socialNotify(state, users, "groups", M{"deleted": id})
		return M{"ok": true}, nil
	case is("POST", "groups", "*", "invite"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		if _, err := socialMember(db, id, uid, true); err != nil {
			return nil, err
		}
		// By username, or by account (`userId`) when picked among friends.
		var other M
		if otherID, ok := idx(body, "userId").(string); ok {
			other, err = socialAccountByID(db, otherID)
		} else {
			var name string
			if name, err = apiString(body, "username", 1, 24); err == nil {
				other, err = socialAccount(db, name)
			}
		}
		if err != nil {
			return nil, err
		}
		if err := socialInvite(db, state, id, uid, user["username"], str(other["id"])); err != nil {
			return nil, err
		}
		if err := socialChanged(db, state, id, false); err != nil {
			return nil, err
		}
		return socialGroup(db, id, uid)
	case is("POST", "groups", "*", "join"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		role, err := socialRole(db, id, uid)
		if err != nil {
			return nil, err
		}
		if role != "invited" {
			return nil, apiErr(409, "You are already in this group.")
		}
		if _, err := db.Exec("UPDATE group_members SET role='member',joined_at=? WHERE group_id=? AND user_id=?", accountsNow(), id, uid); err != nil {
			return nil, err
		}
		if err := socialChanged(db, state, id, true); err != nil {
			return nil, err
		}
		socialNotify(state, []string{uid}, "groups", M{})
		return socialGroup(db, id, uid)
	case is("POST", "groups", "*", "members", "*", "role"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		role, err := socialMember(db, id, uid, true)
		if err != nil {
			return nil, err
		}
		if role != "owner" {
			return nil, apiErr(403, "Only the group's owner can name admins.")
		}
		next, err := apiString(body, "role", 1, 16)
		if err != nil {
			return nil, err
		}
		if next != "admin" && next != "member" {
			return nil, validation()
		}
		changed, err := db.Exec("UPDATE group_members SET role=? WHERE group_id=? AND user_id=? AND role IN ('admin','member')", next, id, parts[3])
		if err != nil {
			return nil, err
		}
		if changed == 0 {
			return nil, apiErr(404, socialUnknownUser)
		}
		if err := socialChanged(db, state, id, false); err != nil {
			return nil, err
		}
		return socialGroup(db, id, uid)
	// Leaving the group, declining an invitation, or (for its owner and admins) removing someone.
	case is("DELETE", "groups", "*", "members", "*"):
		id, err := number(parts[1])
		if err != nil {
			return nil, err
		}
		memberID := parts[3]
		mine, err := socialRole(db, id, uid)
		if err != nil {
			return nil, err
		}
		theirs, err := socialRole(db, id, memberID)
		if err != nil {
			return nil, err
		}
		own := memberID == uid
		if theirs == "owner" && own {
			return nil, apiErr(409, "The owner cannot leave: delete the group instead.")
		}
		if theirs == "owner" {
			return nil, apiErr(409, "The owner cannot be removed.")
		}
		if !own && (mine == "member" || mine == "invited" || (mine == "admin" && theirs == "admin")) {
			return nil, apiErr(403, "Only the group's owner and admins can remove members.")
		}
		if err := socialChanged(db, state, id, true); err != nil {
			return nil, err
		}
		if _, err := db.Exec("DELETE FROM group_members WHERE group_id=? AND user_id=?", id, memberID); err != nil {
			return nil, err
		}
		socialNotify(state, []string{memberID}, "groups", M{"left": id})
		if own {
			return M{"ok": true}, nil
		}
		return socialGroup(db, id, uid)
	}
	return nil, apiErr(404, "Unknown community route")
}
