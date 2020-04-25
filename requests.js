var restify = require('restify');
var errs = require('restify-errors');
var helper = require("./helpers");

var mysql = require('mysql');
var pool = helper.pool;

var moment = require("moment");
var Filter = require('bad-words'),
    filter = new Filter();
    
var pwgenerator = require('generate-password');

module.exports = {
    login: function(req, res, next){
	    if(req.nick == null){
	    	res.send("No nick");
	    	return next(false);
	    }
	    res.send(req.loginResponse);
	    return next();
    },

    search: function(req, res, next){
        var searchItem = req.body.searchItem;
        searchItem = searchItem.split(" ");
        searchItem[0] = '%' + searchItem[0] + "%";
        var conjunction = "or";
        if(searchItem.length > 1){
            searchItem[1] = '%' + searchItem[1] + "%";
            conjunction = "and";
        }
        else{
            searchItem[1] = searchItem[0];
        }
        pool.query('SELECT vorname,nachname FROM teachers where vorname like ' + mysql.escape(searchItem[0]) + ' ' + conjunction + ' nachname like ' + mysql.escape(searchItem[1]), function (err, result, fields) {
            if (err) return next(new restify.errors.InternalServerError('Could not connect to mysql database'));
            var resArr = [];
            for(var i = 0; i < result.length; i++){
                resArr.push([result[i].vorname, result[i].nachname]);
            }
    
            if(resArr.length == 0){
                res.send(200, "empty");
                return next();
            }
            else{
                res.send(200, resArr);
                return next();
            }
            
        });
    },

    category: function(req, res, next){
        var category = req.body.category;
        category = '%,' + category + ',%';
    
        pool.query('SELECT vorname,nachname FROM teachers where fach like ' + mysql.escape(category) + ' ORDER BY nachname;', function(err, result, fields){
            if (err) return next(new restify.errors.InternalServerError('Could not connect to mysql database'));
            var resArr = [];
            for(var i = 0; i < result.length; i++){
                resArr.push([result[i].vorname, result[i].nachname]);
            }
    
            res.send(200, resArr);
        });
    },

    create: function(req, res, next){
        if(req.isTeacher){
            return next(new errs.BadRequestError("Teachers cannot create reviews"));
        }

        var creatorID = req.userID;

		var name = req.body.name.split(' ');
		if(name.length != 2){
            return next(new errs.BadRequestError());
		}
		pool.query("SELECT date FROM reviews INNER JOIN teachers ON reviews.teacher=teachers.id WHERE vorname = " + mysql.escape(name[0]) + " AND nachname = " + mysql.escape(name[1]) + " AND creator_id=" + mysql.escape(creatorID) + " ORDER BY reviews.id desc LIMIT 1;", function(err, result, fields){
			if(err){
                return next(new restify.errors.InternalServerError('Insert failed'));
			}
			if(result.length > 0){
				var timeStamp = moment(result[0].date, 'MM/DD/YYYY');
				var delta = Math.abs(timeStamp.diff(moment(), "days"));
				if(delta < 7){
					res.send(400, "Wait " + (7 - delta) + " more days to write another review");
                    return next(false);
				}
			}
			var grademap;
			try {
				grademap = JSON.parse(req.body.grademap);
				if(grademap[0][0] != 'Unterrichtsgestaltung: ') throw "Invalid grademap";
				if(grademap[1][0] != 'Erklärfähigkeit: ') throw "Invalid grademap";
				if(grademap[2][0] != 'Sympathie: ') throw "Invalid grademap";
			    for(var y = 0; y < grademap.length; y++){
					if(grademap[y].length != 2) throw "Invalid grademap";
					if(grademap[y][1] > 4 || grademap[y][1] < 0) throw "Invalid grade";
					grademap[y][1] = Math.round(grademap[y][1]);
				}
			} catch(e) {
                return next(new errs.BadRequestError());
			}  
                     
			pool.query("INSERT INTO reviews(date, creator_id, review, upvotes, grademap, teacher) SELECT '" + moment().format('L').toString() + "', " + mysql.escape(creatorID) + ", " + mysql.escape(filter.clean(req.body.review)) + ", 0, " + mysql.escape(req.body.grademap) + ", id from teachers where vorname = " + mysql.escape(name[0]) + " and nachname = " + mysql.escape(name[1]) + " limit 1;", function(err, result, fields){
				if(err){
                    return next(new restify.errors.InternalServerError('Insert failed'));
                }
                res.send("Success");
                return next();
			});
		});
    },

    reviews: function(req, res, next){
        var name = req.body.name.split(' ');
        if(name.length != 2){
            return next(new errs.BadRequestError());
        }

        pool.query("SELECT reviews.id, upvotes, review, grademap, nick FROM reviews INNER JOIN teachers ON reviews.teacher = teachers.id INNER JOIN accounts ON reviews.creator_id = accounts.id WHERE teachers.vorname = " + mysql.escape(name[0]) + " AND teachers.nachname = " + mysql.escape(name[1]) + ";", function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not connect to mysql database'));
            for(var i = 0; i < result.length; i++){
                if(result[i].review.length > 400) result[i].review = result[i].review.substring(0,400) + "...";
            }

            if(result.length == 0){
                res.send("Nothing");
                return next();
            }

            res.send(result);
            return next();
        });
    },

    review: function(req, res, next){
        var id = parseInt(req.body.reviewID);
        if(isNaN(id)){
            return next(new errs.BadRequestError());
        }

        pool.query("SELECT reviews.id, upvotes, review, grademap, nick, vorname, nachname FROM reviews INNER JOIN teachers ON reviews.teacher = teachers.id INNER JOIN accounts ON reviews.creator_id = accounts.id WHERE reviews.id = ?;" , [id], function(err, result, fields){
            if (err) return next(new restify.errors.InternalServerError('Could not connect to mysql database'));

            if(result.length == 0){
                res.send("Nothing");
                return next();
            }

            res.send(result[0]);
            return next();            
        });
    },

    reviewsNotReviewed: function(req, res, next){
        if(!req.isMod){
            return next(new errs.BadRequestError("Only mods can do that"));
        }

        pool.query("SELECT reviews.id, upvotes, review, grademap, nick, vorname, nachname FROM reviews INNER JOIN teachers ON reviews.teacher = teachers.id INNER JOIN accounts ON reviews.creator_id = accounts.id WHERE reviewed=0;", function(err, result, fields){
            if (err) return next(new restify.errors.InternalServerError('Could not connect to mysql database'));
            var arr = [];
            for(var i = 0; i < result.length; i++){
                arr.push([result[i].id, result[i].upvotes, result[i].review, result[i].grademap, result[i].nick, result[i].vorname + " " + result[i].nachname]);
            }

            res.send(arr);
            return next();
        });
    },

    setReviewed: function(req, res, next){
        con.query("UPDATE reviews SET reviewed=1 WHERE id = " + mysql.escape(req.body.reviewID), function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not connect to mysql database'));
            res.send("Done");
            return next();
        });
    },

    isMod: function(req, res, next){
        if(req.isMod){
            res.send("Success");
        }
        else{
            res.send(204, "Not mod");
        }

        return next();
    },

    isCreator: function(req, res, next){
        helper.isCreator(req.hash, req.body.reviewID, function(yes){
            if(yes){
                res.send("Success");
            }
            else{
                return next(new errs.BadRequestError("Not creator"));
            }
            return next();
        });
    },

    delete: function(req, res, next){
        helper.isCreator(req.hash, req.body.reviewID, function(yes){
            if(yes || req.isMod){
                helper.deleteReview(req.body.reviewID);
                res.send("Success");
            }
            else {
                return next(new errs.BadRequestError("Not creator or mod"));
            }

            return next();
        });
    },

    nick: function(req, res, next){
        nick = req.body.nick.toLowerCase();
        if(nick.length == 0){
            return next(new errs.BadRequestError("Empty nick"));
        }
        else if(nick.includes(" ")) {
            return next(new errs.BadRequestError("Der Nick darf keine Leerzeichen enthalten"));
        }
        else {
            pool.query("SELECT nick from accounts WHERE nick = ?;" , [nick], function(err, result, fields){
                if(err) return next(new restify.errors.InternalServerError('Could not query existing nicks: ' + err));
                
                if(result.length != 0){
                    res.send(400, "Nick existiert bereits");
                    return next();
                }
                else {
                    pool.query("UPDATE accounts SET nick = " + mysql.escape(nick) + " WHERE accounts.pwhash=" + mysql.escape(req.hash) + " limit 1;", function(err, result, fields){
                        if(err) return next(new restify.errors.InternalServerError('Could not set nick: ' + err));
                        res.send("Success");
                        return next();
                    });	
                }
            });
                                    
        }

    },

    addAnswer: function(req, res, next){
        var creatorID = req.userID;
        pool.query("INSERT INTO answers(answer, creatorID, reviewID) VALUES(?, ?, ?);", [filter.clean(req.body.answer), creatorID, req.body.reviewID], function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not answer: ' + err));
            res.send("Success");
            return next();
        });
    },

    getAnswers: function(req, res, next){
        pool.query("SELECT answer, nick, answers.id FROM answers INNER JOIN accounts ON answers.creatorID = accounts.id WHERE reviewID = ?;", [req.body.reviewID], function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not fetch answers: ' + err));
            res.send(result);
            return next();
        });	
    },

    deleteAnswer: function(req, res, next){
        helper.isAnswerCreator(req.hash, req.body.answerID, function(yes){
            if(yes || req.isMod){
                helper.deleteAnswer(req.body.answerID);
                res.send("Success");
            }
            else {
                return next(new errs.BadRequestError("Not creator or mod"));
            }

            return next();
        });
    },

    getRandomReview: function(req, res, next){
        pool.query("SELECT review, vorname, nachname FROM reviews INNER JOIN teachers on reviews.teacher = teachers.id ORDER BY RAND() LIMIT 1", function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not fetch random review: ' + err));
            res.send(result[0]);
            return next();
        });
    },

    createAccount: function(req, res, next){
        var jahrgang = req.body.jahrgang;
        var vorname = req.body.vorname;
        var nachname = req.body.nachname;
        if(isNaN(jahrgang)){
            return next(new errs.BadRequestError("Jahrgangsstufe is not a number"));
        }

        if(vorname.length == 0 || nachname.length == 0 || jahrgang == 0){
            return next(new errs.BadRequestError("Kein Vorname, Nachname oder Jahrgang angegeben"));
        }
        pool.query("SELECT vorname, nachname FROM registered_people WHERE UPPER(vorname) = ? AND UPPER(nachname) = ?;", [vorname.toUpperCase(), nachname.toUpperCase()], function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not access database: ' + err));

            if(result.length > 0){
                res.send("User already existing");
                return next();
            }

            pool.query("INSERT INTO registered_people(vorname, nachname) VALUES(?, ?);", [vorname, nachname], function(err, result, fields){
                if(err) return next(new restify.errors.InternalServerError('Could not create sql entry ' + err));

                var password = pwgenerator.generate({
                    length: 8,
                    numbers: true
                });
                var hash = crypto.createHash('sha256').update(password).digest("hex");

                pool.query("INSERT INTO accounts(pwhash, jahrgangsstufe) VALUES(?, ?);", [hash, jahrgang], function(err, result, fields){
                    res.send(password);
                    return next();
                });
            });	
        });
    },

    top20: function(req, res, next){
        pool.query("SELECT vorname, nachname FROM ranking INNER JOIN teachers on ranking.teacherID = teachers.id ORDER BY rating DESC, ratingCount DESC LIMIT 10;", function(err, result, fields){
            if(err) return next(new restify.errors.InternalServerError('Could not fetch TOP 20 list: ' + err));
            res.send(result);
            return next();
        });	
    },

}