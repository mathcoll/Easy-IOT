'use strict';
var snippet = {
	name: "simpleclock",
	value: "Realtime clock",
	
	options: {
		color: {defaultValue: "#FF0000", type: 'text'},
		legend: {defaultValue: "top", type: 'select', availableValues: [true, false, "top", "bottom"]}
	},
	activateOnce: function(params) {
		setInterval(function() {app.refreshFromNow('snippet-clock-'+params.id, moment(), null)}, 1000);
	},
	getHtml: function(params) {
		if (!params) {
			params = {}
		}
		params.time = moment().format(app.date_format);
		var html = `
		<div class="clock tile card-simpleclock material-animate margin-top-4 material-animated">
			<span class='mdl-list__item mdl-list__item--two-line'>
				<span class='mdl-list__item-primary-content'>
					<i class='material-icons'>${params.icon}</i>
					<span class="heading">${params.name}</span>
					<span class='mdl-list__item-sub-title' id='snippet-time-${params.id}'></span>
				</span>
				<span class='mdl-list__item-secondary-content'>
					<span class='mdl-list__item'>
						<span class='mdl-list__item-sub-title mdl-chip mdl-chip__text' id='snippet-clock-${params.id}'>${params.time}</span>
					</span>
				</span>
			</span>
		</div>`;
		return html;
	},
};
snippet.getOptions = function(s) { return s.options; }
app.snippetTypes.push(snippet);