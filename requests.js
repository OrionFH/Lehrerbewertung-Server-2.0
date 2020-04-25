var restify = require('restify');
var helper = require("./helpers");

var mysql = require('mysql');
var pool  = mysql.createPool({
  connectionLimit : 100,
  host            : 'localhost',
  user            : 'admin',
  password        : 'Flamel2288/',
  database        : 'standard'
});

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
            if(err) throw err;
            var resArr = [];
            for(var i = 0; i < result.length; i++){
                resArr.push([result[i].vorname, result[i].nachname]);
            }
    
            res.send(200, resArr);
        });
    },

    create: function(req, res, next){
        if(req.isTeacher){
            res.send(400, "Teachers cannot create reviews");
            return next(false);
        }

        var creatorID = JSON.parse(response).id;

		var name = arr[4].split(' ');
		if(name.length != 2){
            res.send(400, "Invalid request");
            return next(false);
		}
		con.query("SELECT date FROM reviews INNER JOIN teachers ON reviews.teacher=teachers.id WHERE vorname = " + mysql.escape(name[0]) + " AND nachname = " + mysql.escape(name[1]) + " AND creator_id=" + mysql.escape(creatorID) + " ORDER BY reviews.id desc LIMIT 1;", function(err, result, fields){
			if(err){
				res.send(400, "Insert failed");
                return next(false);
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
				grademap = JSON.parse(arr[2].replace(/;/g, ","));
				if(grademap[0][0] != 'Unterrichtsgestaltung: ') throw "Invalid grademap";
				if(grademap[1][0] != 'Erklärfähigkeit: ') throw "Invalid grademap";
				if(grademap[2][0] != 'Sympathie: ') throw "Invalid grademap";
			    for(var y = 0; y < grademap.length; y++){
					if(grademap[y].length != 2) throw "Invalid grademap";
					if(grademap[y][1] > 4 || grademap[y][1] < 0) throw "Invalid grade";
					grademap[y][1] = Math.round(grademap[y][1]);
				}
			} catch(e) {
                res.send(400, "Invalid request \n" + e);
                return next(false);
			}  
                     
			con.query("INSERT INTO reviews(date, creator_id, review, upvotes, grademap, teacher) SELECT '" + moment().format('L').toString() + "', " + mysql.escape(creatorID) + ", " + mysql.escape(filter.clean(arr[3])) + ", 0, " + mysql.escape(arr[2]) + ", id from teachers where vorname = " + mysql.escape(name[0]) + " and nachname = " + mysql.escape(name[1]) + " limit 1;", function(err, result, fields){
				if(err){
                    return next(new restify.errors.InternalServerError('Insert failed'));
                }
                res.send("Success");
                return next();
			});
		});
    },

    reviews: function(req, res, next){

    }
}