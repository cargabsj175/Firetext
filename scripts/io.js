/*
* IO Handler
* Copyright (C) Codexa Organization 2013.
*/

'use strict';


/* Namespace Container
------------------------*/ 
firetext.io = {};


/* Variables
------------------------*/
var storage, deviceAPI, locationDevice, docxeditor;


/* Init
------------------------*/
firetext.io.init = function (api, callback) {
  if (window.navigator.getDeviceStorage && api != 'file') {
    // Use deviceStorage API
    deviceAPI = 'deviceStorage';
    storage = navigator.getDeviceStorage('sdcard');
    if (!storage) {
      firetext.io.init('file', callback);
      return;
    }
    
    // Check for SD card
    var request = storage.available();

    request.onsuccess = function () {
      // The result is a string
      if (this.result != "available") {
        deviceAPI = null;
        storage = null;
        alert("The SDCard on your device is shared, and thus not available.  Try disabling USB Mass Storage in your settings.");
        firetext.io.init('file', callback);
        return;
      } else {
        storage.onchange = function (change) {
          updateDocLists(['internal', 'recents']);
        }
        callback();
      }
    };

    request.onerror = function () {
      deviceAPI = null;
      storage = null;
      alert("Unable to get the space used by the SDCard: " + this.error);
      firetext.io.init('file', callback);
      return;
    };
  } else {
    // Check for File API
    window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
    if (window.requestFileSystem) {
      var onFSError = function() {
        alert("Error, could not initialize filesystem");
        deviceAPI = 'none';
        disableInternalStorage();
        callback();
      }
      var requestFs = function(grantedBytes) {
        if(grantedBytes > 0) {
          requestFileSystem(PERSISTENT, grantedBytes, function(fs) {
            storage = fs;
            storage.root.getDirectory("Documents/", {create: true});
            deviceAPI = 'file';
            callback();
          }, onFSError);
        } else {
          onFSError();
        }
      }
      if(navigator.webkitPersistentStorage) {
        navigator.webkitPersistentStorage.requestQuota( /*5MB*/5*1024*1024, requestFs, onFSError );
      } else if(webkitStorageInfo) {
        webkitStorageInfo.requestQuota( PERSISTENT, /*5MB*/5*1024*1024, requestFs, onFSError );
      } else {
        deviceAPI = 'none';
        disableInternalStorage();
        callback();
        return;
      }
    } else {
      // If nonexistent, disable internal storage
      deviceAPI = 'none';
      disableInternalStorage();
      callback();
      return;
    }
  }
  
  // Create storage option
  locationDevice = document.createElement('option');
  locationDevice.textContent = 'Internal';
  locationSelect.appendChild(locationDevice);
}

function disableInternalStorage() {
  welcomeDeviceArea.style.display = 'none';
  openDialogDeviceArea.style.display = 'none';
};


/* Directory IO
------------------------*/
firetext.io.enumerate = function (directory, callback) {
  if (directory) {
    // List of files
    var FILES = [];
    
    // Put directory in proper form
    if (directory.length > 1 && directory[0] == '/') {
      directory = directory.slice(1);
    }
    if (directory[directory.length - 1] != '/') {
      directory = (directory + '/');
    }
  
    if (deviceAPI == 'deviceStorage') {
      // Get all the files in the specified directory
      if (directory == '/') {
        var cursor = storage.enumerate();
      } else {
        var cursor = storage.enumerate(directory.substring(0, -1));
      }
    
      cursor.onerror = function() {
        if (cursor.error.name == 'SecurityError') {
          alert('Please allow Firetext to access your SD card.');
        } else {
          alert('Load unsuccessful :\'( \n\nInfo for gurus:\n"' + cursor.error.name + '"');
        }
      };
      cursor.onsuccess = function() {
        // Get file
        var file = cursor.result;
      
        // Base case
        if (!cursor.result) {            
          // Finish
          callback(FILES);
          return FILES;
        }
        
        // Split name into parts
        var thisFile = firetext.io.split(file.name);
        thisFile[3] = file.type;
        
        // Don't get any files but docs
        if (!thisFile[1] |
             thisFile[3] != 'text/html' &&
             thisFile[3] != 'text/plain') { /* 0.4 &&
             thisFile[3] != 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {*/
          cursor.continue();
          return;        
        }
        
        // Remove duplicates
        for (var i = 0; i < FILES.length; i++) {
          if (FILES[i][0] == thisFile[0] && FILES[i][1] == thisFile[1] && FILES[i][2] == thisFile[2]) {
	        FILES.splice(i, 1);
	        break;
	      }
        }
        
        // Put file directory in proper form
        if (!thisFile[0] | thisFile[0] == '') {
          thisFile[0] = '/';
        }
        
        // Add to list of files
        FILES.push(thisFile);
      
        // Check next file
        cursor.continue();
      };
    } else if (deviceAPI == 'file') {
      storage.root.getDirectory(directory, {}, function(dirEntry) {
        var dirReader = dirEntry.createReader();
        var SUBDIRS = [];
        var readDirContents = function(results) {
          if(!results.length) {
            if (SUBDIRS.length) {
              for (var i = 0; i < SUBDIRS.length; i++) {
                (function(last) {
                  firetext.io.enumerate(SUBDIRS[i].fullPath, function(subFiles) {
                    FILES = FILES.concat(subFiles);
                    if(last) {
                      callback(FILES);
                    }
                  });
                })(i === SUBDIRS.length-1);
              }
            } else {
              callback(FILES);
            }
            return;
          } else {
            var fileparts;
            var filetype;
            var filename;
            for(var i = 0; i < results.length; i++) {
              if (results[i].isDirectory) {
                SUBDIRS.push(results[i]);
                continue;
              }
              fileparts = results[i].name.split(".");
              filetype = fileparts.length >= 2 ? "." + fileparts[fileparts.length - 1] : "";
              filename = filetype.length >= 2 ? fileparts.slice(0, -1).join("") : fileparts[0];
              if (filetype !== ".txt" && filetype !== ".html") { // 0.4 && filetype !== ".docx") {
                continue;
              }
              FILES.push([directory, filename, filetype]);
            }
            dirReader.readEntries(readDirContents);
          }
        }
        dirReader.readEntries(readDirContents);
      }, function(err) {
        if(err.code == FileError.NOT_FOUND_ERR) {
          callback();
        } else {
          alert("Error\ncode: " + err.code);
        }
      });
    }
    return FILES;
  }
};


/* File IO
------------------------*/
function createFromDialog() {
  var directory = 'Documents/';
  var location = document.getElementById('createDialogFileLocation').value;
  var filename = document.getElementById('createDialogFileName').value;
  var filetype = document.getElementById('createDialogFileType').value;
  if (filename == null | filename == undefined | filename == '')  {
    alert('Please enter a name for the new file.');
    return;
  } else if (!isValidFileName(filename)) {
    alert('Filename contains special characters!  Please revise.');
    return;
  }
  
  // Navigate back to the previous screen
  regions.navBack();
  
  // Convert location to lower case
  location = location.toLowerCase();
  
  // Save the file
  if (!location | location == '' | location == 'internal') {
  
    // Get mime
    var type = "text";
    switch (filetype) {
      case ".html":
        type = "text\/html";
        break;
      case ".txt":
        type = "text\/plain";
        break;
      /* 0.4
      case ".docx":
        type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      */
      default:
        break;
    }
    var contentBlob;
    if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      contentBlob = new Blob([firetext.parsers.docx.blank], {type: type});
    } else {
      contentBlob = new Blob([' '], { "type" : type });
    }
    if (deviceAPI == 'deviceStorage') {
      // Make directory accurate
      directory = ('/sdcard/'+directory);

      var filePath = (directory + filename + filetype);
      var req = storage.addNamed(contentBlob, filePath);
      req.onerror = function () {
        if (this.error.name == "NoModificationAllowedError" | this.error.name == "FileExistsError") {
          alert('This file already exists, please choose another name.');
        }
        else {
          alert('File creation unsuccessful :( \n\nInfo for gurus:\n"' + this.error.name + '"');
        }
      };  
      req.onsuccess = function () {  
        // Load to editor
        loadToEditor(directory, filename, filetype, 'internal');
        
        // Update list
        updateDocLists(['internal']);
      };
    } else if (deviceAPI == 'file') {
      storage.root.getFile(directory + filename + filetype, {create: true, exclusive: true}, function(fileEntry) {
        fileEntry.createWriter(function(fileWriter){
          fileWriter.onwriteend = function(e) {
            e.target.write(contentBlob);
            e.target.onwriteend = function(e) {
              loadToEditor(directory, filename, filetype, 'internal');
            }
            e.target.onerror = function(e) {
              alert("Error writing to new file :(\n\nInfo for gurus:\n\"" + e.message + '"');
            }
          };
          
          fileWriter.onerror = function(e) {
            alert("Error writing to new file :(\n\nInfo for gurus:\n\"" + e.message + '"');
          };
          
          fileWriter.truncate(0);
        }, function(err) {
          alert("Error writing to new file :(\n\ncode: " + err.code);
        });
      }, function(err) {
        if(err.code === FileError.INVALID_MODIFICATION_ERR) {
          alert('This file already exists, please choose another name.');
        } else {
          alert("File creation unsuccessful :(\n\ncode: " + err.code);
        }
      });
    }
  } else if (location == 'dropbox') {
    directory = ('/' + directory);
    firetext.io.save(directory, filename, filetype, ' ', false, function () {  
      // Load to editor
      loadToEditor(directory, filename, filetype, location);      
        
      // Update list
      updateDocLists(['cloud']);
    }, location);
  } else {
    alert('Could not create file.  Please choose a valid location.');
  }
  
  // Clear file fields
  document.getElementById('createDialogFileName').value = '';
  document.getElementById('createDialogFileType').value = '.html';
  extIcon();
}

function isValidFileName(filename) {
  return (/^[a-zA-Z0-9-\._ ]+$/.test(filename) && !(/\.\./.test(filename)) && !(/\.$/.test(filename)));
}

function saveFromEditor(banner, spinner) {
  // Clear save timeout
  saveTimeout = null;

  // Select elements
  var location = document.getElementById('currentFileLocation').textContent;
  var directory = document.getElementById('currentFileDirectory').textContent;
  var filename = document.getElementById('currentFileName').textContent;
  var filetype = document.getElementById('currentFileType').textContent;
  var content = "";
  switch (filetype) {
    case ".html":
      content = rawEditor.textContent;
      break;
    case ".txt":
      content = firetext.parsers.plain.encode(doc.innerHTML, "HTML");
      break;
    /* 0.4
    case ".docx":
      content = doc;
      break;
    */
    default:
      content = doc.textContent;
      break;
  }
  firetext.io.save(directory, filename, filetype, content, banner, function(){ fileChanged = false; }, location, spinner, docxeditor);
}

function loadToEditor(directory, filename, filetype, location, editable) {
  // Clear editor
  doc.innerHTML = '';
  rawEditor.textContent = '';
  
  // Set file name and type
  document.getElementById('currentFileLocation').textContent = location;
  document.getElementById('currentFileDirectory').textContent = directory;
  document.getElementById('currentFileName').textContent = filename;
  document.getElementById('currentFileType').textContent = filetype;
  
  // Set alert banner name and type
  document.getElementById('save-banner-name').textContent = (directory + filename);
  document.getElementById('save-banner-type').textContent = filetype;
  
  // Show/hide toolbar
  switch (filetype) {
    /* 0.4
    case ".docx":
    */
    case ".html":
      document.getElementById('edit-bar').style.display = 'block'; // 0.2 only
      editor.classList.remove('no-toolbar'); // 0.2 only
      toolbar.classList.remove('hidden');
      break;
    case ".txt":
    default:
      document.getElementById('edit-bar').style.display = 'none'; // 0.2 only
      editor.classList.add('no-toolbar'); // 0.2 only
      toolbar.classList.add('hidden');
      break;
  }
  
  // Fill editor
  firetext.io.load(directory, filename, filetype, function(result, error) {
    if (!error) {
      var content;
  
      switch (filetype) {
        case ".txt":
          content = firetext.parsers.plain.parse(result, "HTML");
          doc.innerHTML = content;
          tabRaw.classList.add('hidden');
          regions.tab(document.querySelector('#editTabs'), 'design');
          break;
        /* 0.4
        case ".docx":
          result = new DocxEditor(result);
          content = result.HTMLout();
          doc.appendChild(content);
          tabRaw.classList.add('hidden');
          regions.tab(document.querySelector('#editTabs'), 'design');
          break;
        */
        case ".html":
        default:
          content = result;
          doc.innerHTML = content;
          rawEditor.textContent = content;
          tabRaw.classList.remove('hidden');  
          break;
      }             
    
      // Handle read-only files
      if (editable == false) {
        formatDoc('contentReadOnly', true);
      } else {
        formatDoc('contentReadOnly', false);      
      }
    
      // Add listener to update views
      watchDocument(filetype);
      
      // Start toolbar update interval      
      toolbarInterval = window.setInterval(updateToolbar, 100);
      
      // Add file to recent docs
      firetext.recents.add([directory, filename, filetype], location);
  
      // Show editor
      regions.nav('edit');
  
      // Hide save button if autosave is enabled
      if (firetext.settings.get('autosave') != 'false') {
        document.getElementById('editorSaveButton').style.display = 'none';
        document.getElementById('zenSaveButton').style.display = 'none';
      } else {
        document.getElementById('editorSaveButton').style.display = 'inline-block';
        document.getElementById('zenSaveButton').style.display = 'inline-block';
      }
    } else {
      alert('File could not be loaded. \n\nInfo for gurus:\n'+result);
    }
  }, location); 
}

firetext.io.save = function (directory, filename, filetype, content, showBanner, callback, location, showSpinner, docx) {
  // Set saving to true
  saving = true;

  // Get filetype
  var type = "text";
  switch (filetype) {
    case ".html":
      type = "text\/html";
      break;
    /* 0.4
    case ".docx":
      type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      break;
    */
    case ".txt":
    default:
      type = "text\/plain";
      break;
  }
  var contentBlob;
  
  /* 0.4
  // Special handling for .docx
  if (filetype == '.docx') {
    docx.HTMLin(content);
    contentBlob = new Blob([docxeditor.generate("blob")], {type: type});
  } else {
    contentBlob = new Blob([content], { "type" : type });
  }
  */

  // 0.3 only
  contentBlob = new Blob([content], { "type" : type });

  var filePath = (directory + filename + filetype);
  
  if (location == '' | location == 'internal' | !location) {  
    // Start spinner  
    if (showSpinner == true) {
      spinner();
    }
    
    // Save file
    if (deviceAPI == 'deviceStorage') {
      var req = storage.addNamed(contentBlob, filePath);
      req.onsuccess = function () {
        // Show banner or hide spinner
        if (showBanner) {
          showSaveBanner();
        }
        if (showSpinner == true) {
          spinner('hide');
        }
        
        // Finish
        saving = false;
        callback();
      };
      req.onerror = function () {
        if (this.error.name == "NoModificationAllowedError") {
          var req2 = storage.delete(filePath);
          req2.onsuccess = function () {
            firetext.io.save(directory, filename, filetype, content, showBanner, callback, location, showSpinner, docx);
          };
          req2.onerror = function () {
            alert('Save unsuccessful :( \n\nInfo for gurus:\n"' + this.error.name + '"');
          }
        } else {
          alert('Save unsuccessful :( \n\nInfo for gurus:\n"' + this.error.name + '"');
        }
        saving = false;
      };
    } else if (deviceAPI == 'file') {
      storage.root.getFile(directory + filename + filetype, {create: true}, function(fileEntry) {
        fileEntry.createWriter(function(fileWriter){
          fileWriter.onwriteend = function(e) {
            e.target.onwriteend = function(e) {
              // Show banner or hide spinner
              if (showBanner) {
                showSaveBanner();
              }
              if (showSpinner == true) {
                spinner('hide');
              }
              
              // Finish
              saving = false;
              callback();
            }
            e.target.onerror = function(e) {
              saving = false;
              alert("Error writing to new file :(\n\nInfo for gurus:\n\"" + e.message + '"');
            }
            e.target.write(contentBlob);
          };
          
          fileWriter.onerror = function(e) {
            saving = false;
            alert("Error writing to new file :(\n\nInfo for gurus:\n\"" + e.message + '"');
          };
          fileWriter.truncate(0);
        }, function(err) {
          saving = false;
          alert("Error writing to file :(\n\ncode: " + err.code);
        });
      }, function(err) {
        saving = false;
        alert("Error opening file :(\n\ncode: " + err.code);
      });
    }
  } else if (location == 'dropbox') {
    cloud.dropbox.save(filePath, contentBlob, showSpinner, function () { 
      // Show banner
      if (showBanner) {
        showSaveBanner();
      }
       
      // Finish 
      saving = false;
      callback(); 
    });
  }
};

firetext.io.load = function (directory, filename, filetype, callback, location) {
  if (!directory | !filename | !filetype | !callback) {
    return;
  }
  
  // Show spinner
  spinner();

  // Put directory in proper form
  if (directory[directory.length - 1] != '/') {
    directory = (directory + '/');
  }
  if (directory == '/' && directory.length == 1) {
    directory = '';
  }
    
  var filePath = (directory + filename + filetype);
  
  if (location == '' | location == 'internal' | !location) {
    if (deviceAPI == 'deviceStorage') {
      var req = storage.get(filePath);
      req.onsuccess = function () {
        var file = req.result;
        var reader = new FileReader();
        
        /* 0.4
        if (filetype == ".docx") {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
        */
        
        // 0.3 only
        reader.readAsText(file);
        
        reader.onerror = function () {  
          // Hide spinner
          spinner('hide');
          
          alert('Load unsuccessful :( \n\nInfo for gurus:\n"' + this.error.name + '"');
          callback(this.error.name, true);
        };
        reader.onload = function () {
          var file;
          
          /* 0.4
          if( filetype === ".docx" ) {
            file = new DocxEditor(this.result);
          } else {
            file = this.result;
          }
          */
        
          // 0.3 only
          file = this.result;
          
          // Hide spinner
          spinner('hide');
          
          callback(file);
        };
      };
      req.onerror = function () {
        if (this.error.name == "NotFoundError") {
          // New file, leave user to edit and save it
        }
        else {
          alert('Load unsuccessful :( \n\nInfo for gurus:\n"' + this.error.name + '"');
        }
        
        // Hide spinner
        spinner('hide');
      };
    } else if (deviceAPI == 'file') {
      storage.root.getFile(directory + filename + filetype, {}, function(fileEntry) {
        fileEntry.file(function(file) {
          var reader = new FileReader();
          
          reader.onerror = function () {
            // Hide spinner
            spinner('hide');
            
            alert('Load unsuccessful :( \n\nInfo for gurus:\n"' + this.error.name + '"');
            callback(this.error.name, true);
          };
          reader.onload = function () {          
            /* 0.4
            if( filetype === ".docx" ) {
              file = new DocxEditor(this.result);
            } else {
              file = this.result;
            }
            */
        
            // 0.3 only
            file = this.result;
            
            // Hide spinner
            spinner('hide');
            
            callback(file);
          };
          
          /* 0.4
          if (filetype === ".docx") {
            reader.readAsArrayBuffer(file);
          } else {
            reader.readAsText(file);
          }
          */
          
          // 0.3 only
          reader.readAsText(file);
        }, function(err) {
          alert("Error opening file\n\ncode: " + err.code);
          
          // Hide spinner
          spinner('hide');
        });
      }, function(err) {
        if (err.code === FileError.NOT_FOUND_ERR) {
          alert("Load unsuccessful :(\n\nError code: " + err.code);          
        } else {
          alert("Load unsuccessful :(\n\nError code: " + err.code);
        }
        
        // Hide spinner
        spinner('hide');
      });
    }
  } else if (location = 'dropbox') {
    cloud.dropbox.load(filePath, function (result, error) {
      // Hide spinner
      spinner('hide');
          
      callback(result, error);
    });
  }
};

firetext.io.delete = function (name, location) {
  var path = name;
  if (!location | location == '' | location == 'internal') {
    if (deviceAPI == 'deviceStorage') {
      var req = storage.delete(path);
      req.onsuccess = function () {
        // Code to show a deleted banner
      }
      req.onerror = function () {
        // Code to show an error banner (the alert is temporary)
        alert('Delete unsuccessful :(\n\nInfo for gurus:\n"' + this.error.name + '"');
      }
    } else if (deviceAPI == 'file') {
      storage.root.getFile(path, {}, function(fileEntry) {
        fileEntry.remove(function() {
        }, function(err) {
          alert('Delete unsuccessful :(\n\ncode: ' + err.code);
        });
      }, function(err) {
        alert('Delete unsuccessful :(\n\ncode: ' + err.code);
      });
    }
  } else if (location == 'dropbox') {
    cloud.dropbox.delete(path);
  }
};

firetext.io.rename = function (directory, name, type, newname, location) {
  firetext.io.load(directory, name, type, function(result) {
    var fullName = (directory + name + type);
    firetext.io.save(directory, name, type, result, function () {}, location);
    firetext.io.delete(fullName, location);
  }, location);
};

firetext.io.split = function (path) {
  var file = new Array();
  file[0] = path.substring(0, (path.lastIndexOf('/') + 1));
  file[1] = path.substring((path.lastIndexOf('/') + 1), path.lastIndexOf('.')).replace(/\//, '');
  file[2] = path.substring(path.lastIndexOf('.'), path.length).replace(/\//, '');
  if (file[1] == '' && file[2] == '') {
    file[0] = (file[0] + file[2]);
    if (file[0][file[0].length - 1] != '/') {
      file[0] = (file[0] + '/');
    }
    file[1] = '';
    file[2] = '';
  }
  return [file[0], file[1], file[2]];
};
