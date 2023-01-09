'use strict';

// いろいなライブラリ(モジュール)を読込む設定
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const helmet = require('helmet');
const session = require('express-session');
const passport = require('passport');

// モデルの読み込み
const User = require('./models/user');
const Schedule = require('./models/schedule');
const Availability = require('./models/availability');
const Candidate = require('./models/candidate');
const Comment = require('./models/comment');
User.sync().then(async () => {
  Schedule.belongsTo(User, {foreignKey: 'createdBy'});
  Schedule.sync();
  Comment.belongsTo(User, {foreignKey: 'userId'});
  Comment.sync();
  Availability.belongsTo(User, {foreignKey: 'userId'});
  await Candidate.sync();
  Availability.belongsTo(Candidate, {foreignKey: 'candidateId'});
  Availability.sync();
});

//  passport が GitHub の OAuth 認証のストラテジモジュール>決まり文
const GitHubStrategy = require('passport-github2').Strategy;

// 外部認証トークン、パスワードは変化しないで変数は慣習的に大文字
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '2f831cb3d4aac02393aa';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '9fbc340ac0175123695d2dedfbdf5a78df3b8067';

// 外部認証シリアライズがセッションに登録(保存)
passport.serializeUser(function (user, done) {
  done(null, user);
});

// 外部認証デシアライズが保存されたデータを取得(読み出す)
passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

// 外部認証ストラテジモジュールのリファレンス通りにカキコする
passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'http://localhost:8000/auth/github/callback'
},
  function (accessToken, refreshToken, profile, done) {
    // 非同期の処理、ログイン処理はI/Oイベントで重い
    // コールバックは、関数Aの引数に関数Bを設定するときの関数Bのこと
    process.nextTick(async function () {
      await User.upsert({
        userId: profile.id,
        username: profile.username
      });
      done(null, profile);
    });
  }
));

// 変数を宣言して、各ルータを読込む
var indexRouter = require('./routes/index');
const loginRouter = require('./routes/login');
const logoutRouter = require('./routes/logout');
const schedulesRouter = require('./routes/schedules');
const availabilitiesRouter = require('./routes/availabilities');
const commentsRouter = require('./routes/comments');

// express本体とhelmetを使う
var app = express();
app.use(helmet());

// viewsファイルがどこにあるの？＞’views’の__dirnameにある＞決まり文
app.set('views', path.join(__dirname, 'views'));
// テンプレートエンジンにpugを指定
app.set('view engine', 'pug');

/* ここはひな形なので知っておく程度 */
// loggerロガーはログを書き込むためのツール設定し’dev’は開発環境
app.use(logger('dev'));
// json形式を解釈して作成できる設定
app.use(express.json());
// urlencodedを使う設定でextendedを(false)使わない設定
app.use(express.urlencoded({ extended: false }));
// クッキー扱う設定
app.use(cookieParser());
// publicを公開する場所を設定＞expressで静的ファイルをpublicという
// 静的ファイル(js, img, css)の格納ディレクトリを教える
app.use(express.static(path.join(__dirname, 'public')));


//  GitHub 認証を行うための処理＞リファレンス通り
app.use(session({ secret: 'e55be81b307c1c09', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());



// ルーティングの設定
/*
  expressってapp.useの処理順に見ていく
  各、処理にアクセスがあるかどうかの処理
  各、処理のres.renderが呼ばれる
  res.renderがなければnext(createError(404))を返す
  アクセスがあったら、分岐先のルータに処理を渡す
*/
//トップページにアクセスあれば、indexRouterを呼び出す
app.use('/', indexRouter);
app.use('/login', loginRouter);
app.use('/logout', logoutRouter);
app.use('/schedules', schedulesRouter);
app.use('/schedules', availabilitiesRouter);
app.use('/schedules', commentsRouter);

app.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] }),
  function (req, res) {
});

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  function (req, res) {
    const loginFrom = req.cookies.loginFrom;
    // オープンリダイレクタ脆弱性対策
    if (loginFrom &&
      loginFrom.startsWith('/')) {
      res.clearCookie('loginFrom');
      res.redirect(loginFrom);
    } else {
      // 成功しらた'/'トップページに送る
      res.redirect('/');
    }
});

// catch 404 and forward to error handler
/*
 ページがなかったら処理で404を設定
 nextはapp.use(funtion)のerrを渡しに行く
 indexRouter,usersRouterにヒットしないなら404ってこと
*/
 app.use(function(req, res, next) {
  // ここでは単純404を返すだけでエラーページを作成してない
  next(createError(404));
});

// error handler
// next 関数で次の呼び出し
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  // localsは手元環境のエラーメッセージとして表示
  res.locals.message = err.message;
  // 環境が…開発中ならばエラー表示、本番だったらエラーをださない（三項演算子）
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  // views/error.pugの処理に進む
  res.render('error');
});

module.exports = app;
