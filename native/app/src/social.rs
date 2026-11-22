//! The community: conversations with friends and groups, friends (requests, search), groups (members, their
//! tournaments and battles, invitations), and coaching (finding a coach, booking a session, your sessions). Everything
//! comes from the API; the socket's "social" events reload what changed.
use crate::ctx::{Ctx, spawn};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::press::{Look, press};
use crate::theme::*;
use crate::tournaments::{n, s};
use crate::ui::{self, tx};
use iced::widget::{Space, column, container, row, text};
use iced::{Alignment, Element, Length, Padding, Task};
use qbix_core::api::{ApiError, encode};
use qbix_core::{date, t, tf};
use serde_json::{Value, json};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Tab {
    Messages,
    Friends,
    Groups,
    Coaching,
}

#[derive(Debug, Clone)]
pub enum Msg {
    Tab(Tab),
    Me(Result<Value, ApiError>),
    Conversations(Result<Value, ApiError>),
    Open(i64),
    Messages(i64, Result<Value, ApiError>),
    Draft(String),
    Send,
    Sent(Result<Value, ApiError>),
    Search(String),
    Found(Result<Value, ApiError>),
    AddFriend(String),
    Accept(String),
    Remove(String),
    Done(Result<Value, ApiError>),
    Group(i64),
    GroupLoaded(Result<Value, ApiError>),
    Join(i64),
    NewGroup(String),
    CreateGroup,
    Coaches(Result<Value, ApiError>),
    Bookings(Result<Value, ApiError>),
    Coach(String),
    Slots(Result<Value, ApiError>),
    Book(String, i64),
    Note(String),
    Cancel(String),
    Drawer(bool),
    Chat(String),
    Invite(String),
    SendInvite(i64),
    Leave(i64),
    Battle(i64),
    TournamentName(String),
    CreateTournament(i64),
    AcceptBattle(i64),
    /// Play a match (the app takes it to the match's page).
    Play(i64),
}

enum Side {
    Group(Option<Result<Value, String>>),
    Coach(String, Option<Result<Value, String>>),
}

pub struct Page {
    me: Option<Result<Value, String>>,
    conversations: Option<Result<Vec<Value>, String>>,
    open_chat: Option<i64>,
    messages: Option<Result<Vec<Value>, String>>,
    draft: String,
    query: String,
    found: Vec<Value>,
    group_name: String,
    coaches: Option<Result<Vec<Value>, String>>,
    bookings: Vec<Value>,
    note: String,
    side: Option<Side>,
    open: bool,
    invite: String,
    tournament: String,
}

/// Whether the server offers coaching (hidden on the production server for now, as the web has it).
pub fn coaching_shown(ctx: &Ctx) -> bool { !ctx.store.settings.server.contains("cubix.vitrixxl.fr") }

impl Page {
    pub fn new() -> Self { Self { me: None, conversations: None, open_chat: None, messages: None, draft: String::new(), query: String::new(), found: vec![], group_name: String::new(), coaches: None, bookings: vec![], note: String::new(), side: None, open: false, invite: String::new(), tournament: String::new() } }

    fn tab(ctx: &Ctx) -> Tab {
        match ctx.store.settings.pref("social.tab") {
            Some("friends") => Tab::Friends,
            Some("groups") => Tab::Groups,
            Some("coaching") if coaching_shown(ctx) => Tab::Coaching,
            _ => Tab::Messages,
        }
    }

    pub fn enter(&mut self, ctx: &Ctx) -> Task<Msg> {
        if !ctx.store.signed_in() { return Task::none() }
        let get = |path: &'static str, m: fn(Result<Value, ApiError>) -> Msg| {
            let api = ctx.api();
            Task::perform(spawn(move || api.get::<Value>(path)), m)
        };
        let mut tasks = vec![get("social/me", Msg::Me), get("social/conversations", Msg::Conversations)];
        if Self::tab(ctx) == Tab::Coaching { tasks.extend([get("coaching/coaches", Msg::Coaches), get("coaching/bookings", Msg::Bookings)]) }
        if let Some(id) = self.open_chat { tasks.push(self.load_messages(ctx, id)) }
        Task::batch(tasks)
    }

    fn load_messages(&self, ctx: &Ctx, id: i64) -> Task<Msg> {
        let api = ctx.api();
        let read = ctx.api();
        Task::perform(
            spawn(move || {
                let r = api.get::<Value>(&format!("social/conversations/{id}/messages"));
                let _ = read.post::<Value>(&format!("social/conversations/{id}/read"), &json!({}));
                r
            }),
            move |r| Msg::Messages(id, r),
        )
    }

    /// An event of the socket's "social" channel: what it touches is read again.
    pub fn live(&mut self, _v: &Value, ctx: &Ctx) -> Task<Msg> { self.enter(ctx) }

    pub fn unread(&self) -> i64 { self.conversations.as_ref().and_then(|c| c.as_ref().ok()).map_or(0, |c| c.iter().map(|x| n(x, "unread")).sum()) }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        let call = |ctx: &Ctx, method: &'static str, path: String, body: Value| {
            let api = ctx.api();
            Task::perform(spawn(move || api.send::<Value>(method, &path, &body)), Msg::Done)
        };
        match msg {
            Msg::Tab(tab) => {
                ctx.store.settings.set_pref("social.tab", match tab { Tab::Messages => "messages", Tab::Friends => "friends", Tab::Groups => "groups", Tab::Coaching => "coaching" });
                ctx.changed();
                self.open = false;
                return self.enter(ctx);
            }
            Msg::Me(r) => self.me = Some(r.map_err(|e| e.message())),
            Msg::Conversations(r) => self.conversations = Some(r.map(|v| v.as_array().cloned().unwrap_or_default()).map_err(|e| e.message())),
            Msg::Open(id) => {
                self.open_chat = Some(id);
                self.messages = None;
                if Self::tab(ctx) != Tab::Messages { ctx.store.settings.set_pref("social.tab", "messages") }
                return self.load_messages(ctx, id);
            }
            Msg::Messages(id, r) => if self.open_chat == Some(id) { self.messages = Some(r.map(|v| v.as_array().cloned().unwrap_or_default()).map_err(|e| e.message())) },
            Msg::Draft(d) => self.draft = d.chars().take(1000).collect(),
            Msg::Send => {
                let Some(id) = self.open_chat else { return Task::none() };
                let body = self.draft.trim().to_string();
                if body.is_empty() { return Task::none() }
                self.draft.clear();
                let api = ctx.api();
                return Task::perform(spawn(move || api.post::<Value>(&format!("social/conversations/{id}/messages"), &json!({ "body": body }))), Msg::Sent);
            }
            Msg::Sent(r) => {
                if let Err(e) = r { ctx.toast(e.message()) }
                if let Some(id) = self.open_chat { return self.load_messages(ctx, id) }
            }
            Msg::Search(q) => {
                self.query = q;
                if self.query.trim().len() >= 2 {
                    let (api, q) = (ctx.api(), encode(self.query.trim()));
                    return Task::perform(spawn(move || api.get::<Value>(&format!("social/users?q={q}"))), Msg::Found);
                }
                self.found.clear();
            }
            Msg::Found(r) => self.found = r.ok().and_then(|v| v.as_array().cloned()).unwrap_or_default(),
            Msg::AddFriend(name) => return call(ctx, "POST", "social/friends".into(), json!({ "username": name })),
            Msg::Accept(id) => return call(ctx, "POST", format!("social/friends/{id}/accept"), json!({})),
            Msg::Remove(id) => return call(ctx, "DELETE", format!("social/friends/{id}"), json!({})),
            Msg::Done(r) => {
                match r {
                    Ok(_) => ctx.toast(t("Done")),
                    Err(e) => ctx.toast(e.message()),
                }
                return self.enter(ctx);
            }
            Msg::Group(id) => {
                self.side = Some(Side::Group(None));
                self.open = true;
                let api = ctx.api();
                return Task::perform(spawn(move || api.get::<Value>(&format!("social/groups/{id}"))), Msg::GroupLoaded);
            }
            Msg::GroupLoaded(r) => self.side = Some(Side::Group(Some(r.map_err(|e| e.message())))),
            Msg::Join(id) => return call(ctx, "POST", format!("social/groups/{id}/join"), json!({})),
            Msg::NewGroup(name) => self.group_name = name.chars().take(60).collect(),
            Msg::CreateGroup => {
                let name = self.group_name.trim().to_string();
                if name.len() < 2 { return Task::none() }
                self.group_name.clear();
                return call(ctx, "POST", "social/groups".into(), json!({ "name": name, "description": "" }));
            }
            Msg::Coaches(r) => self.coaches = Some(r.map(|v| v.as_array().cloned().unwrap_or_default()).map_err(|e| e.message())),
            Msg::Bookings(r) => self.bookings = r.ok().and_then(|v| v.as_array().cloned()).unwrap_or_default(),
            Msg::Coach(id) => {
                self.side = Some(Side::Coach(id.clone(), None));
                self.open = true;
                let api = ctx.api();
                return Task::perform(spawn(move || api.get::<Value>(&format!("coaching/coaches/{id}/slots"))), Msg::Slots);
            }
            Msg::Slots(r) => if let Some(Side::Coach(id, _)) = &self.side { self.side = Some(Side::Coach(id.clone(), Some(r.map_err(|e| e.message())))) },
            Msg::Book(coach, start) => {
                let note = self.note.trim().to_string();
                self.open = false;
                return call(ctx, "POST", "coaching/bookings".into(), json!({ "coachId": coach, "start": start, "note": note, "cancellationPolicy": "24h-v1" }));
            }
            Msg::Note(note) => self.note = note.chars().take(1000).collect(),
            Msg::Cancel(id) => return call(ctx, "POST", format!("coaching/bookings/{id}/cancel"), json!({})),
            Msg::Drawer(o) => self.open = o,
            Msg::Invite(name) => self.invite = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(24).collect(),
            Msg::SendInvite(group) => {
                let name = std::mem::take(&mut self.invite);
                return call(ctx, "POST", format!("social/groups/{group}/invite"), json!({ "username": name }));
            }
            Msg::Leave(group) => {
                let me = ctx.store.user.as_ref().map(|u| u.id.clone()).unwrap_or_default();
                self.open = false;
                return call(ctx, "DELETE", format!("social/groups/{group}/members/{me}"), json!({}));
            }
            Msg::Battle(group) => {
                let event = ctx.store.settings.context.event_id();
                return call(ctx, "POST", "matches".into(), json!({ "groupId": group, "event": event, "points": 3, "sets": 1 }));
            }
            Msg::TournamentName(n) => self.tournament = n.chars().take(60).collect(),
            Msg::CreateTournament(group) => {
                let name = std::mem::take(&mut self.tournament);
                let event = ctx.store.settings.context.event_id();
                let starts = qbix_core::store::now_ms() as i64 + 15 * 60_000;
                return call(ctx, "POST", "tournaments".into(), json!({ "groupId": group, "name": name, "description": "", "event": event, "points": 3, "sets": 1, "startsAt": starts, "maxPlayers": 16 }));
            }
            Msg::AcceptBattle(m) => return call(ctx, "POST", format!("matches/{m}/accept"), json!({})),
            Msg::Play(_) => {}
            Msg::Chat(user) => {
                let api = ctx.api();
                return Task::perform(spawn(move || api.post::<Value>("social/conversations", &json!({ "userId": user }))), |r| match r {
                    Ok(v) => Msg::Open(n(&v, "id")),
                    Err(e) => Msg::Done(Err(e)),
                });
            }
        }
        Task::none()
    }

    pub fn escape(&mut self) { self.open = false }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let tab = Self::tab(ctx);
        let body: Element<'a, Msg> = if !ctx.store.signed_in() {
            container(ui::empty(icon::USERS, t("Friends, groups and messages need an account"), t("Sign in from the profile to talk with other cubers, join groups and find a coach."))).center(Length::Fill).into()
        } else {
            match tab {
                Tab::Messages => self.messages_view(ctx),
                Tab::Friends => self.friends_view(),
                Tab::Groups => self.groups_view(),
                Tab::Coaching => self.coaching_view(),
            }
        };
        let mut view = View::new(t("Social"), body);
        let mut tabs = vec![(Tab::Messages, "Messages"), (Tab::Friends, "Friends"), (Tab::Groups, "Groups")];
        if coaching_shown(ctx) { tabs.push((Tab::Coaching, "Coaching")) }
        let unread = self.unread();
        view.tabs = tabs.into_iter().map(|(k, name)| (if k == Tab::Messages && unread > 0 { format!("{} · {unread}", t(name)) } else { t(name) }, Msg::Tab(k), k == tab)).collect();
        if let Some(side) = &self.side {
            let (title, key, body): (String, String, Element<'a, Msg>) = match side {
                Side::Group(g) => match g {
                    None => (t("Group"), "group".into(), ui::small(t("Loading…")).into()),
                    Some(Err(e)) => (t("Group"), "group".into(), ui::small(e.clone()).into()),
                    Some(Ok(v)) => (s(v, "name"), format!("group:{}", n(v, "id")), self.group_view(v)),
                },
                Side::Coach(id, slots) => {
                    let coach = self.coaches.as_ref().and_then(|c| c.as_ref().ok()).and_then(|c| c.iter().find(|x| s(x, "id") == *id));
                    (coach.map_or_else(|| t("Coach"), |c| s(c, "username")), format!("coach:{id}"), self.coach_view(id, coach, slots.as_ref()))
                }
            };
            view.drawer = Some(Drawer { open: self.open, key, title, sub: None, back: None, close: Msg::Drawer(false), body });
        }
        view
    }

    fn conversation_name(c: &Value) -> String { c["with"]["username"].as_str().or(c["group"]["name"].as_str()).unwrap_or("?").to_string() }

    fn messages_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let list: Element<'a, Msg> = match &self.conversations {
            None => ui::small(t("Loading…")).into(),
            Some(Err(e)) => ui::small(e.clone()).into(),
            Some(Ok(list)) if list.is_empty() => ui::empty(icon::CHAT, t("No conversation yet"), t("Add friends or join a group to talk.")),
            Some(Ok(list)) => ui::scroll(column(list.iter().map(|c| {
                let id = n(c, "id");
                let on = self.open_chat == Some(id);
                let name = Self::conversation_name(c);
                let last = c["lastMessage"].as_object().map(|m| if m.get("card").and_then(Value::as_str).is_some() { t("A battle") } else { m.get("body").and_then(Value::as_str).unwrap_or("").to_string() }).unwrap_or_default();
                let unread = n(c, "unread");
                press(Look::Tab { on }, row![ui::avatar(&name, 40.0), column![tx(name.clone(), 15.0, 650, INK), text(last).size(13.0).font(crate::theme::text(500)).color(INK3).wrapping(text::Wrapping::None)].spacing(2).width(Length::Fill), if unread > 0 { ui::chip(unread.to_string(), SHEET, ACC) } else { Space::new().into() }].spacing(12).align_y(Alignment::Center)).width(Length::Fill).height(62).radius(18.0).padding([0, 10]).on_press(Msg::Open(id)).into()
            })).spacing(2)).height(Length::Fill).into(),
        };
        let thread: Element<'a, Msg> = match (&self.open_chat, &self.messages) {
            (None, _) => container(ui::empty(icon::CHAT, t("Choose a conversation"), t("Your messages with friends and groups."))).center(Length::Fill).into(),
            (Some(_), None) => container(ui::small(t("Loading…"))).center(Length::Fill).into(),
            (Some(_), Some(Err(e))) => container(ui::small(e.clone())).center(Length::Fill).into(),
            (Some(id), Some(Ok(msgs))) => {
                let me = ctx.store.user.as_ref().map(|u| u.id.clone()).unwrap_or_default();
                let conv = self.conversations.as_ref().and_then(|c| c.as_ref().ok()).and_then(|c| c.iter().find(|x| n(x, "id") == *id));
                let bubbles = column(msgs.iter().map(|m| {
                    let mine = s(m, "senderId") == me;
                    let body = if m.get("match").is_some_and(|x| !x.is_null()) { tf("A battle: {0}", &[&crate::challenges::label_of(&s(&m["match"], "event"))]) } else if m.get("tournament").is_some_and(|x| !x.is_null()) { tf("Tournament: {0}", &[&s(&m["tournament"], "name")]) } else { s(m, "body") };
                    let bubble = container(column![if mine { Element::from(Space::new().height(0)) } else { tx(m["sender"]["username"].as_str().unwrap_or("").to_string(), 12.5, 700, ACC_INK).into() }, text(body).size(15.0).font(crate::theme::text(500)).color(if mine { SHEET } else { INK }), tx(date::ago(n(m, "createdAt")), 11.5, 500, if mine { fade(SHEET, 0.75) } else { INK3 })].spacing(3)).padding([9, 14]).max_width(460).style(move |_| container::Style { background: Some((if mine { ACC } else { fade(INK, 0.06) }).into()), border: iced::border::rounded(18), ..Default::default() });
                    container(bubble).width(Length::Fill).align_x(if mine { Alignment::End } else { Alignment::Start }).into()
                }))
                .spacing(8);
                let writable = conv.is_none_or(|c| c["open"].as_bool() != Some(false));
                let input: Element<'a, Msg> = if writable { row![ui::field(&t("Write a message"), &self.draft, Msg::Draft).on_submit(Msg::Send).width(Length::Fill), press(Look::Primary, icon(icon::SEND, 18.0, SHEET)).width(52).height(46).padding(0).on_press(Msg::Send)].spacing(8).align_y(Alignment::Center).into() } else { ui::small(t("You are no longer friends: this conversation is closed.")).into() };
                column![tx(conv.map(Self::conversation_name).unwrap_or_default(), 18.0, 700, INK), ui::scroll(bubbles.padding(Padding { right: 12.0, ..Padding::ZERO })).height(Length::Fill).anchor_bottom(), input].spacing(12).height(Length::Fill).into()
            }
        };
        if ctx.phone {
            if self.open_chat.is_some() { column![press(Look::Ghost, row![icon(icon::BACK, 15.0, INK3), tx(t("Conversations"), 14.0, 600, INK3)].spacing(6).align_y(Alignment::Center)).height(36).on_press(Msg::Tab(Tab::Messages)), thread].spacing(8).height(Length::Fill).into() } else { list }
        } else {
            row![container(list).width(330).height(Length::Fill), container(thread).width(Length::Fill).height(Length::Fill)].spacing(24).height(Length::Fill).into()
        }
    }

    fn friends_view<'a>(&'a self) -> Element<'a, Msg> {
        let Some(Ok(me)) = &self.me else { return container(ui::small(self.me.as_ref().and_then(|m| m.as_ref().err().cloned()).unwrap_or_else(|| t("Loading…")))).center(Length::Fill).into() };
        let person = |p: &Value, actions: Element<'a, Msg>| -> Element<'a, Msg> { row![ui::avatar(&s(p, "username"), 40.0), tx(s(p, "username"), 15.5, 650, INK).width(Length::Fill), actions].spacing(12).align_y(Alignment::Center).height(56).into() };
        let mut col = column![
            ui::label(t("Find a cuber")),
            ui::field(&t("A username"), &self.query, Msg::Search).width(Length::Fill),
        ]
        .spacing(10)
        .max_width(760);
        for f in &self.found {
            col = col.push(person(f, press(Look::Tonal, row![icon(icon::USER_PLUS, 15.0, ACC_INK), tx(t("Add"), 14.0, 650, ACC_INK)].spacing(6).align_y(Alignment::Center)).height(38).on_press(Msg::AddFriend(s(f, "username"))).into()));
        }
        let incoming = me["incoming"].as_array().cloned().unwrap_or_default();
        if !incoming.is_empty() {
            col = col.push(container(ui::label(t("Requests"))).padding(ui::padding_top(14.0)));
            for p in incoming {
                let id = s(&p, "id");
                col = col.push(person(&p, row![press(Look::Soft, tx(t("Decline"), 14.0, 600, INK2)).height(38).on_press(Msg::Remove(id.clone())), press(Look::Primary, tx(t("Accept"), 14.0, 650, SHEET)).height(38).on_press(Msg::Accept(id))].spacing(6).into()));
            }
        }
        let friends = me["friends"].as_array().cloned().unwrap_or_default();
        col = col.push(container(ui::label(qbix_core::i18n::plural(friends.len(), "{0} friend", "{0} friends"))).padding(ui::padding_top(14.0)));
        for p in friends {
            let id = s(&p, "id");
            col = col.push(person(&p, row![press(Look::Soft, icon(icon::CHAT, 16.0, INK2)).width(40).padding(0).on_press(Msg::Chat(id.clone())), press(Look::Ghost, icon(icon::USER_X, 16.0, INK3)).width(40).padding(0).on_press(Msg::Remove(id))].spacing(6).into()));
        }
        let outgoing = me["outgoing"].as_array().cloned().unwrap_or_default();
        if !outgoing.is_empty() {
            col = col.push(container(ui::label(t("Sent"))).padding(ui::padding_top(14.0)));
            for p in outgoing {
                col = col.push(person(&p, ui::small(t("waiting")).into()));
            }
        }
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { right: 12.0, bottom: 20.0, ..Padding::ZERO })).height(Length::Fill).into()
    }

    fn groups_view<'a>(&'a self) -> Element<'a, Msg> {
        let Some(Ok(me)) = &self.me else { return container(ui::small(t("Loading…"))).center(Length::Fill).into() };
        let mut col = column![].spacing(6).max_width(760);
        let invitations = me["invitations"].as_array().cloned().unwrap_or_default();
        if !invitations.is_empty() {
            col = col.push(ui::label(t("Invitations")));
            for g in invitations {
                col = col.push(row![container(ui::item(Some(icon::USERS), s(&g, "name"), Some(tf("invited by {0}", &[&s(&g, "invitedBy")])), None::<Msg>)).width(Length::Fill), press(Look::Primary, tx(t("Join"), 14.0, 650, SHEET)).height(40).on_press(Msg::Join(n(&g, "id")))].spacing(10).align_y(Alignment::Center));
            }
        }
        col = col.push(container(ui::label(t("Your groups"))).padding(ui::padding_top(10.0)));
        for g in me["groups"].as_array().cloned().unwrap_or_default() {
            col = col.push(ui::item(Some(icon::USERS), s(&g, "name"), Some(format!("{} · {}", qbix_core::i18n::plural(n(&g, "members") as usize, "{0} member", "{0} members"), t(&s(&g, "role")))), Some(Msg::Group(n(&g, "id")))));
        }
        col = col.push(container(ui::label(t("Create a group"))).padding(ui::padding_top(16.0)));
        col = col.push(row![ui::field(&t("The group's name"), &self.group_name, Msg::NewGroup).on_submit(Msg::CreateGroup).width(Length::Fill), press(Look::Tonal, tx(t("Create"), 14.5, 650, ACC_INK)).height(44).on_press_maybe((self.group_name.trim().len() >= 2).then_some(Msg::CreateGroup))].spacing(10).align_y(Alignment::Center));
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { right: 12.0, bottom: 20.0, ..Padding::ZERO })).height(Length::Fill).into()
    }

    fn group_view<'a>(&'a self, g: &'a Value) -> Element<'a, Msg> {
        let mut col = column![ui::body(s(g, "description")), press(Look::Tonal, row![icon(icon::CHAT, 16.0, ACC_INK), tx(t("Open the group's conversation"), 14.5, 650, ACC_INK)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(46).on_press(Msg::Open(n(g, "conversationId")))].spacing(14);
        let members = g["members"].as_array().cloned().unwrap_or_default();
        col = col.push(ui::label(qbix_core::i18n::plural(members.len(), "{0} member", "{0} members")));
        for m in members {
            col = col.push(row![ui::avatar(&s(&m, "username"), 32.0), tx(s(&m, "username"), 14.5, 600, INK).width(Length::Fill), ui::small(t(&s(&m, "role")))].spacing(10).align_y(Alignment::Center));
        }
        let id = n(g, "id");
        let admin = matches!(g["role"].as_str(), Some("owner" | "admin"));
        col = col.push(row![ui::field(&t("Invite a cuber by username"), &self.invite, Msg::Invite).on_submit(Msg::SendInvite(id)).width(Length::Fill), press(Look::Tonal, icon(icon::USER_PLUS, 16.0, ACC_INK)).width(44).padding(0).on_press_maybe((self.invite.len() >= 3).then_some(Msg::SendInvite(id)))].spacing(8).align_y(Alignment::Center));
        col = col.push(press(Look::Soft, row![icon(icon::SWORDS, 16.0, INK2), tx(t("Challenge the group to a battle"), 14.5, 600, INK2)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(44).on_press(Msg::Battle(id)));
        let battles = g["battles"].as_array().cloned().unwrap_or_default();
        if !battles.is_empty() {
            col = col.push(ui::label(t("Battles")));
            for b in battles.iter().rev().take(12) {
                let p = |i: usize| b["players"][i]["username"].as_str().unwrap_or("—").to_string();
                let status = s(b, "status");
                let mid = n(b, "id");
                let action: Element<'a, Msg> = match status.as_str() {
                    "waiting" => press(Look::Tonal, tx(t("Accept"), 13.5, 650, ACC_INK)).height(34).on_press(Msg::AcceptBattle(mid)).into(),
                    "ready" | "live" => press(Look::Primary, tx(t("Play"), 13.5, 650, SHEET)).height(34).on_press(Msg::Play(mid)).into(),
                    _ => ui::small(t(&status)).into(),
                };
                col = col.push(row![tx(format!("{} · {} vs {}", crate::challenges::label_of(&s(b, "event")), p(0), p(1)), 14.0, 600, INK).width(Length::Fill), action].spacing(8).align_y(Alignment::Center));
            }
        }
        let tournaments = g["tournaments"].as_array().cloned().unwrap_or_default();
        if !tournaments.is_empty() {
            col = col.push(ui::label(t("Tournaments")));
            for x in tournaments {
                col = col.push(ui::small(format!("{} · {}", s(&x, "name"), t(&s(&x, "status")))));
            }
        }
        if admin {
            col = col.push(ui::label(t("New tournament")));
            col = col.push(row![ui::field(&t("Its name"), &self.tournament, Msg::TournamentName).on_submit(Msg::CreateTournament(id)).width(Length::Fill), press(Look::Tonal, tx(t("Create"), 14.0, 650, ACC_INK)).height(44).on_press_maybe((self.tournament.trim().len() >= 2).then_some(Msg::CreateTournament(id)))].spacing(8).align_y(Alignment::Center));
            col = col.push(ui::small(t("It opens for registration now and starts in 15 minutes, on the timer's event, first to 3 points.")));
        }
        if g["role"].as_str() != Some("owner") { col = col.push(press(Look::Danger, tx(t("Leave the group"), 14.0, 600, BAD)).height(40).on_press(Msg::Leave(id))) }
        ui::scroll(col).height(Length::Fill).into()
    }

    fn coaching_view<'a>(&'a self) -> Element<'a, Msg> {
        let mut col = column![].spacing(8).max_width(900);
        let upcoming: Vec<&Value> = self.bookings.iter().filter(|b| b["status"] == "booked").collect();
        if !upcoming.is_empty() {
            col = col.push(ui::label(t("Your sessions")));
            for b in upcoming {
                let who = b["with"]["username"].as_str().unwrap_or("").to_string();
                col = col.push(row![container(ui::item(Some(icon::CALENDAR), tf("With {0}", &[&who]), Some(format!("{} · {}", date::with_time(n(b, "startsAt")), s(b, "note"))), Some(Msg::Open(n(b, "conversationId"))))).width(Length::Fill), press(Look::Danger, tx(t("Cancel"), 14.0, 600, BAD)).height(38).on_press(Msg::Cancel(s(b, "id")))].spacing(10).align_y(Alignment::Center));
            }
        }
        col = col.push(container(ui::label(t("Coaches"))).padding(ui::padding_top(12.0)));
        match &self.coaches {
            None => col = col.push(ui::small(t("Loading…"))),
            Some(Err(e)) => col = col.push(ui::small(e.clone())),
            Some(Ok(list)) => {
                for c in list {
                    let events = c["events"].as_array().map(|a| a.iter().filter_map(Value::as_str).map(crate::challenges::label_of).collect::<Vec<_>>().join(", ")).unwrap_or_default();
                    let price = format!("{:.0} € / {}", n(c, "priceCents") as f64 / 100.0, t("session"));
                    col = col.push(press(Look::Ghost, row![ui::avatar(&s(c, "username"), 48.0), column![tx(s(c, "username"), 16.0, 700, INK), tx(s(c, "headline"), 14.0, 600, INK2), ui::small(format!("{events} · {}", c["languages"].as_array().map(|a| a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", ")).unwrap_or_default()))].spacing(3).width(Length::Fill), column![tx(price, 14.5, 700, ACC_INK), ui::small(format!("★ {:.1}", c["rating"].as_f64().unwrap_or(0.0)))].spacing(3).align_x(Alignment::End)].spacing(14).align_y(Alignment::Center)).width(Length::Fill).height(Length::Shrink).padding([12, 12]).radius(20.0).on_press(Msg::Coach(s(c, "id"))));
                }
            }
        }
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { right: 12.0, bottom: 20.0, ..Padding::ZERO })).height(Length::Fill).into()
    }

    fn coach_view<'a>(&'a self, id: &'a str, coach: Option<&'a Value>, slots: Option<&'a Result<Value, String>>) -> Element<'a, Msg> {
        let mut col = column![].spacing(14);
        if let Some(c) = coach { col = col.push(text(s(c, "bio")).size(15.0).font(crate::theme::text(500)).color(INK2).line_height(1.45)) }
        col = col.push(ui::field(&t("A note for the coach (optional)"), &self.note, Msg::Note));
        match slots {
            None => col = col.push(ui::small(t("Loading the free slots…"))),
            Some(Err(e)) => col = col.push(ui::small(e.clone())),
            Some(Ok(v)) => {
                col = col.push(ui::label(tf("Free slots · {0} minutes", &[&n(v, "sessionMinutes")])));
                col = col.push(ui::small(t("Cancel up to 24 hours before for free; booking accepts this policy.")));
                for slot in v["slots"].as_array().cloned().unwrap_or_default().into_iter().take(24) {
                    let start = n(&slot, "start");
                    col = col.push(press(Look::Soft, row![icon(icon::CALENDAR, 15.0, INK2), tx(date::with_time(start), 14.5, 600, INK), Space::new().width(Length::Fill), tx(t("Book"), 14.0, 650, ACC_INK)].spacing(10).align_y(Alignment::Center)).width(Length::Fill).height(44).radius(14.0).padding([0, 14]).on_press(Msg::Book(id.to_string(), start)));
                }
            }
        }
        ui::scroll(col).height(Length::Fill).into()
    }
}
