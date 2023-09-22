const Hospital = require('../models/hospital')
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');  //to forward geocode the locations
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });
const { cloudinary } = require('../cloudinary');

module.exports.index = async (req, res) => {
    const hospitals = await Hospital.find({});
    res.render('hospitals/index', { hospitals })
};

module.exports.renderNewForm = (req, res) => {
    res.render('hospitals/new');
}

module.exports.renderAboutForm = (req, res) => {
    res.render('hospitals/about');
}

module.exports.createHospital = async (req, res, next) => {
    // if (!req.body.hospital) throw new ExpressError('Invalid Hospital Data', 400);
    const geoData = await geocoder.forwardGeocode({
        query: req.body.hospital.location,
        limit: 1
    }).send();

    const hospital = req.body.hospital;
    const facilities = Object.values(req.body.facilities);   //extracting facilites(doctors' names)
    hospital['facilities'] = facilities;
    const data = new Hospital(hospital);
    data.geometry = geoData.body.features[0].geometry;
    data.images = req.files.map(f => ({ url: f.path, filename: f.filename }));
    data.author = req.user._id;
    await data.save();
    req.flash('success', 'New hospital added!')
    res.redirect(`/hospitals/${data._id}`)
};

module.exports.showHospital = async (req, res,) => {
    //sending data after populating author and reviews models
    const hospital = await Hospital.findById(req.params.id).populate({
        path: 'reviews',
        populate: {
            path: 'author'
        }
    }).populate('author');
    if (!hospital) {
        req.flash('error', 'Cannot find the Hospital!');
        res.redirect('/hospitals');
    }
    res.render('hospitals/show', { hospital });
};

module.exports.renderEditForm = async (req, res) => {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) {
        req.flash('error', 'Cannot find the Hospital!');
        res.redirect('/hospitals');
    }
    res.render('hospitals/edit', { hospital });
};

module.exports.editHospital = async (req, res) => {
    const { id } = req.params;
    const hospital = req.body.hospital;
    const facilities = Object.values(req.body.facilities);
    hospital['facilities'] = facilities;
    const data = await Hospital.findByIdAndUpdate(id, { ...hospital });
    const imgs = req.files.map(f => ({ url: f.path, filename: f.filename }));
    data.images.push(...imgs);  //pushing new images
    await data.save();
    if (req.body.deleteImages) {
        for (let filename of req.body.deleteImages) {
            await cloudinary.uploader.destroy(filename);  //destroying deleted photos from cloudinary account
        }
        await data.updateOne({ $pull: { images: { filename: { $in: req.body.deleteImages } } } });
        //destroying deleted photos from database
    }
    res.redirect(`/hospitals/${data._id}`);
};

module.exports.searchHospitals = async (req, res) => {
    let hospitals = await Hospital.find({});
    let { title, location, doctor } = req.query;
    //filtering by title if present
    if (title)
        hospitals = hospitals.filter(function (el) {
            return el.title.includes(title);
        })

    //filtering by location if present
    if (location)
        hospitals = hospitals.filter(function (el) {
            return el.location.includes(location);
        })

    //filtering by doctors if present
    if (doctor !== 'none')
        hospitals = hospitals.filter(function (el) {
            return el.facilities.includes(doctor);
        })
    res.render('hospitals/search', { hospitals });
}

module.exports.deleteHospital = async (req, res) => {
    const { id } = req.params;
    await Hospital.findByIdAndDelete(id);
    res.redirect('/hospitals');
};
