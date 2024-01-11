// CONCEPT:
// a series of really nice, well chosen family photos of the YDs so far
// and then a slick animated reveal of the photo of Baby3 and details

// THOUGHTS:
// - existing photos shouldn't take long
// - should work well on mobile
// - somehow need to be able to get the images onto the site from my phone
// --> this last part needs some thought but perhaps pipedream + Dropbox or something can make that work?


// maybe some animation? https://codepen.io/GreenSock/details/BarmbXq
// would really like to do this very well as a hobby project
// just copying from someone else doesn't fill me with any joy.

/*
Thoughts re: how the images can get in:
- we can have aome automation _somewhere_ but what does it do?
- start with what we have: 
    - have a phone, photos will be on the phone
    - need to be able to upload the photos _reliably_ 
    - ideally have them auto-resized (that isn't required)
    - and then have them served from a webpage
    - also need to be able to set the website live remotely

UPLOAD TO GITHUB IN FOLDERS
CALL GITHUB API FROM FRONT-END -> to find the URLs of the images?

    GITHUB API?

- approaches:
    - website could not change - it needs to have some remote trigger to go live
    - 
*/



function changeCss () {
    const NUMBER_OF_SLIDES = 5;
    var windowHeight = window.innerHeight;
    var bodyElement = document.querySelector("body");
    var progressBarElement = document.querySelector("#progress-bar");
    progressBarElement.style.width = ((this.scrollY/windowHeight)+1)* (100/NUMBER_OF_SLIDES) + '%'
  }
  
function advanceSlide() {
    var windowHeight = window.innerHeight;
    var slideNumber = Math.floor(document.body.scrollTop/windowHeight)+2;
    location.hash = '#' + slideNumber;
}

function setInitialSlide() {
    var slideNumber = 1;
    location.hash = '#' + slideNumber;
}

  window.addEventListener("scroll", changeCss , false);
  window.addEventListener("click", advanceSlide, false);


  window.addEventListener("load", setInitialSlide, false);
  window.addEventListener("load", changeCss, false);
